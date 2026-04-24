const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, cloudinary } = require('../middleware/upload');

const router = express.Router();

// ── Home / Feed ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const recent = await pool.query(`
    SELECT e.id, e.name, e.type, e.city, e.address,
           ROUND(AVG(r.rating), 1) AS avg_rating,
           COUNT(r.id) AS review_count,
           MAX(r.created_at) AS last_reviewed
    FROM establishments e
    LEFT JOIN reviews r ON r.establishment_id = e.id
    GROUP BY e.id
    ORDER BY last_reviewed DESC NULLS LAST
    LIMIT 20
  `);
  res.render('home', {
    user: req.session.username,
    isAdmin: req.session.isAdmin,
    establishments: recent.rows,
  });
});

// ── Search ───────────────────────────────────────────────────────────────────
router.get('/search', requireAuth, async (req, res) => {
  const { q, type } = req.query;
  let results = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    const typeFilter = type && type !== 'all' ? type : null;
    const query = typeFilter
      ? `SELECT e.id, e.name, e.type, e.city, e.address,
                ROUND(AVG(r.rating),1) AS avg_rating, COUNT(r.id) AS review_count
         FROM establishments e
         LEFT JOIN reviews r ON r.establishment_id = e.id
         WHERE (LOWER(e.name) LIKE LOWER($1) OR LOWER(e.city) LIKE LOWER($1) OR LOWER(e.address) LIKE LOWER($1))
           AND e.type = $2
         GROUP BY e.id ORDER BY e.name`
      : `SELECT e.id, e.name, e.type, e.city, e.address,
                ROUND(AVG(r.rating),1) AS avg_rating, COUNT(r.id) AS review_count
         FROM establishments e
         LEFT JOIN reviews r ON r.establishment_id = e.id
         WHERE LOWER(e.name) LIKE LOWER($1) OR LOWER(e.city) LIKE LOWER($1) OR LOWER(e.address) LIKE LOWER($1)
         GROUP BY e.id ORDER BY e.name`;

    const params = typeFilter ? [term, typeFilter] : [term];
    const r = await pool.query(query, params);
    results = r.rows;
  }

  res.render('search', {
    user: req.session.username,
    isAdmin: req.session.isAdmin,
    results,
    q: q || '',
    type: type || 'all',
  });
});

// ── Nearby (API endpoint, called from JS) ────────────────────────────────────
router.get('/api/nearby', requireAuth, async (req, res) => {
  const { lat, lng, radius = 10 } = req.query; // radius in km
  if (!lat || !lng) return res.json({ error: 'lat and lng required' });

  // Haversine approximation in SQL
  const result = await pool.query(`
    SELECT e.id, e.name, e.type, e.city, e.address, e.lat, e.lng,
           ROUND(AVG(r.rating),1) AS avg_rating, COUNT(r.id) AS review_count,
           ROUND(
             6371 * acos(
               LEAST(1, cos(radians($1)) * cos(radians(e.lat)) *
               cos(radians(e.lng) - radians($2)) +
               sin(radians($1)) * sin(radians(e.lat)))
             )::numeric, 1
           ) AS distance_km
    FROM establishments e
    LEFT JOIN reviews r ON r.establishment_id = e.id
    WHERE e.lat IS NOT NULL AND e.lng IS NOT NULL
    GROUP BY e.id
    HAVING 6371 * acos(
      LEAST(1, cos(radians($1)) * cos(radians(e.lat)) *
      cos(radians(e.lng) - radians($2)) +
      sin(radians($1)) * sin(radians(e.lat)))
    ) <= $3
    ORDER BY distance_km
    LIMIT 30
  `, [parseFloat(lat), parseFloat(lng), parseFloat(radius)]);

  res.json(result.rows);
});

// ── Add establishment form ────────────────────────────────────────────────────
router.get('/add', requireAuth, (req, res) => {
  res.render('add-establishment', {
    user: req.session.username,
    isAdmin: req.session.isAdmin,
    error: null,
  });
});

router.post('/add', requireAuth, upload.array('photos', 5), async (req, res) => {
  const { name, type, address, city, country, lat, lng, website, rating, comment, visited_date } = req.body;

  if (!name || !type || !rating) {
    return res.render('add-establishment', {
      user: req.session.username,
      isAdmin: req.session.isAdmin,
      error: 'Name, type and rating are required',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const estResult = await client.query(
      `INSERT INTO establishments (name, type, address, city, country, lat, lng, website, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [name.trim(), type, address || null, city || null, country || 'UK',
       lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null, website || null, req.session.userId]
    );
    const establishmentId = estResult.rows[0].id;

    const reviewResult = await client.query(
      `INSERT INTO reviews (establishment_id, user_id, rating, comment, visited_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [establishmentId, req.session.userId, parseInt(rating), comment || null, visited_date || null]
    );
    const reviewId = reviewResult.rows[0].id;

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          'INSERT INTO review_photos (review_id, cloudinary_url, cloudinary_public_id) VALUES ($1, $2, $3)',
          [reviewId, file.path, file.filename]
        );
      }
    }

    await client.query('COMMIT');
    res.redirect('/');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.render('add-establishment', {
      user: req.session.username,
      isAdmin: req.session.isAdmin,
      error: 'Failed to save — please try again',
    });
  } finally {
    client.release();
  }
});

// ── Place detail page ─────────────────────────────────────────────────────────
router.get('/place/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const estResult = await pool.query(
    `SELECT e.*, u.username AS added_by_name,
            ROUND(AVG(r.rating),1) AS avg_rating, COUNT(r.id) AS review_count
     FROM establishments e
     LEFT JOIN users u ON u.id = e.added_by
     LEFT JOIN reviews r ON r.establishment_id = e.id
     WHERE e.id = $1
     GROUP BY e.id, u.username`,
    [id]
  );

  if (estResult.rows.length === 0) {
    return res.status(404).render('error', { user: req.session.username, message: 'Place not found' });
  }

  const reviewsResult = await pool.query(
    `SELECT r.*, u.username, 
            COALESCE(json_agg(rp.cloudinary_url) FILTER (WHERE rp.id IS NOT NULL), '[]') AS photos
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN review_photos rp ON rp.review_id = r.id
     WHERE r.establishment_id = $1
     GROUP BY r.id, u.username
     ORDER BY r.created_at DESC`,
    [id]
  );

  const userReview = reviewsResult.rows.find(r => r.user_id === req.session.userId);

  res.render('place', {
    user: req.session.username,
    isAdmin: req.session.isAdmin,
    establishment: estResult.rows[0],
    reviews: reviewsResult.rows,
    userReview,
  });
});

// ── Add review to existing place ──────────────────────────────────────────────
router.post('/place/:id/review', requireAuth, upload.array('photos', 5), async (req, res) => {
  const { id } = req.params;
  const { rating, comment, visited_date } = req.body;

  if (!rating) return res.redirect(`/place/${id}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reviewResult = await client.query(
      `INSERT INTO reviews (establishment_id, user_id, rating, comment, visited_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [id, req.session.userId, parseInt(rating), comment || null, visited_date || null]
    );
    const reviewId = reviewResult.rows[0].id;

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          'INSERT INTO review_photos (review_id, cloudinary_url, cloudinary_public_id) VALUES ($1, $2, $3)',
          [reviewId, file.path, file.filename]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
  }

  res.redirect('/');
});

// ── Delete review (own or admin) ──────────────────────────────────────────────
router.post('/review/:id/delete', requireAuth, async (req, res) => {
  const { id } = req.params;
  const review = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
  if (!review.rows[0]) return res.redirect('/');

  const canDelete = review.rows[0].user_id === req.session.userId || req.session.isAdmin;
  if (!canDelete) return res.redirect(`/place/${review.rows[0].establishment_id}`);

  // Delete photos from cloudinary
  const photos = await pool.query('SELECT cloudinary_public_id FROM review_photos WHERE review_id = $1', [id]);
  for (const p of photos.rows) {
    try { await cloudinary.uploader.destroy(p.cloudinary_public_id); } catch (e) { /* ignore */ }
  }

  const estId = review.rows[0].establishment_id;
  await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
  res.redirect(`/place/${estId}`);
});

// ── Delete establishment (admin only) ────────────────────────────────────────
router.post('/place/:id/delete', requireAuth, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/');

  const { id } = req.params;

  // Get all photos across all reviews for this establishment
  const photos = await pool.query(`
    SELECT rp.cloudinary_public_id
    FROM review_photos rp
    JOIN reviews r ON r.id = rp.review_id
    WHERE r.establishment_id = $1
  `, [id]);

  // Delete from Cloudinary
  for (const p of photos.rows) {
    try { await cloudinary.uploader.destroy(p.cloudinary_public_id); } catch (e) { /* ignore */ }
  }

  // Delete establishment (cascades to reviews and review_photos via DB)
  await pool.query('DELETE FROM establishments WHERE id = $1', [id]);

  res.redirect('/');
});


module.exports = router;
