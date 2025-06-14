const jwt = require('jsonwebtoken');
const { logSecurityEvent } = require('../utils/securityLogger');

module.exports = {
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
      logSecurityEvent('MISSING_TOKEN', {
        ip: req.ip,
        method: req.method,
        url: req.originalUrl
      });
      return res.status(401).json({ 
        code: 'UNAUTHENTICATED',
        message: 'Token d\'accès requis'
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        const eventType = err.name === 'TokenExpiredError' ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN';
        
        logSecurityEvent(eventType, {
          ip: req.ip,
          method: req.method,
          url: req.originalUrl,
          error: err.message
        });

        return res.status(401).json({ 
          code: eventType,
          message: err.name === 'TokenExpiredError' 
            ? 'Session expirée' 
            : 'Token invalide',
          requiresLogin: true
        });
      }

      // Vérification supplémentaire de l'utilisateur
      if (!user.id || !user.user_type) {
        logSecurityEvent('MALFORMED_TOKEN', {
          ip: req.ip,
          tokenPayload: user
        });
        return res.status(401).json({
          code: 'INVALID_TOKEN_CONTENT',
          message: 'Token corrompu'
        });
      }

      // Ajout de données de sécurité
      req.user = {
        ...user,
        authMethod: 'jwt',
        tokenIssuedAt: new Date(user.iat * 1000),
        tokenExpiresAt: new Date(user.exp * 1000)
      };

      logSecurityEvent('AUTH_SUCCESS', {
        userId: user.id,
        userType: user.user_type
      });

      next();
    });
  },

  requireRoles: (...allowedRoles) => {
    return (req, res, next) => {
      if (!req.user) {
        logSecurityEvent('UNAUTHORIZED_ACCESS', {
          reason: 'No user object',
          attemptedRoute: req.originalUrl
        });
        return res.status(401).json({
          code: 'AUTH_REQUIRED',
          message: 'Authentification requise'
        });
      }

      if (!allowedRoles.includes(req.user.user_type)) {
        logSecurityEvent('UNAUTHORIZED_ACCESS', {
          userId: req.user.id,
          userRole: req.user.user_type,
          requiredRoles: allowedRoles,
          attemptedRoute: req.originalUrl
        });

        return res.status(403).json({
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Accès réservé aux rôles: ${allowedRoles.join(', ')}`,
          currentRole: req.user.user_type,
          requiredRoles: allowedRoles
        });
      }

      next();
    };
  },

  // Middleware spécial pour les admins
  requireAdmin: function() {
    return this.requireRoles('admin');
  },

  // Middleware pour les utilisateurs actifs
  requireActiveUser: (req, res, next) => {
    if (req.user && req.user.is_active !== true) {
      logSecurityEvent('INACTIVE_ACCOUNT_ACCESS', {
        userId: req.user.id
      });
      return res.status(403).json({
        code: 'ACCOUNT_INACTIVE',
        message: 'Votre compte est désactivé'
      });
    }
    next();
  },

  // Middleware de sécurité supplémentaire
  enhanceSecurity: (req, res, next) => {
    // Headers de sécurité
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    });

    // Logging des requêtes sensibles
    if (req.originalUrl.includes('/admin') || req.method !== 'GET') {
      logSecurityEvent('SENSITIVE_REQUEST', {
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.id || 'anonymous',
        ip: req.ip
      });
    }

    next();
  }
};