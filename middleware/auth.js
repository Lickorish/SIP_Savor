function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.isAdmin) {
    return next();
  }
  res.status(403).render('error', {
    user: req.session.username || null,
    message: 'Admin access required',
  });
}

module.exports = { requireAuth, requireAdmin };
