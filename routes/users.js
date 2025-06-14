// routes/users.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Middleware d'authentification (à adapter selon votre système)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token d\'accès requis' });
  }

  // Ici vous pouvez ajouter la vérification JWT si nécessaire
  // Pour l'instant, on laisse passer
  next();
};

// ✅ Route de santé (publique)
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Users API is healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/users/health',
      'GET /api/users',
      'GET /api/users/stats',
      'POST /api/users',
      'PUT /api/users/:id',
      'PUT /api/users/:id/status',
      'DELETE /api/users/:id',
      'POST /api/users/bulk-action'
    ]
  });
});

// ✅ Obtenir la liste des utilisateurs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type, status } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM users WHERE 1=1';
    let params = [];

    if (search) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (type) {
      query += ' AND user_type = ?';
      params.push(type);
    }

    if (status) {
      const isActive = status === 'actif' ? 1 : 0;
      query += ' AND is_active = ?';
      params.push(isActive);
    }

    // Compter le total
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.execute(countQuery, params);
    const total = countResult[0].total;

    // Ajouter pagination
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [users] = await pool.execute(query, params);

    // Transformer les données pour le front
    const transformedUsers = users.map(user => ({
      id: user.id.toString(),
      nom: user.last_name || '',
      prenom: user.first_name || '',
      email: user.email,
      type: user.user_type,
      statut: user.is_active ? 'actif' : 'inactif',
      avatar: user.avatar || null,
      telephone: user.phone || '',
      pays: user.country || '',
      ville: user.city || '',
      specialite: user.bio || '',
      nombreMissions: 0, // À calculer selon votre logique
      noteGlobale: 0, // À calculer selon votre logique
      signalements: 0, // À calculer selon votre logique
      dateInscription: user.created_at,
      derniereConnexion: user.last_login || user.updated_at
    }));

    res.json({
      users: transformedUsers,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Obtenir les statistiques
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN user_type = 'freelance' THEN 1 ELSE 0 END) as freelances,
        SUM(CASE WHEN user_type = 'client' THEN 1 ELSE 0 END) as clients,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as actifs,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactifs
      FROM users
    `);

    const result = stats[0];
    res.json({
      total: parseInt(result.total),
      freelances: parseInt(result.freelances),
      clients: parseInt(result.clients),
      actifs: parseInt(result.actifs),
      inactifs: parseInt(result.inactifs),
      suspendus: 0 // À implémenter selon votre logique
    });

  } catch (error) {
    console.error('Erreur récupération stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Créer un utilisateur
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, email, user_type, phone, bio } = req.body;

    if (!email || !first_name || !last_name) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const [result] = await pool.execute(`
      INSERT INTO users (first_name, last_name, email, user_type, phone, bio, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    `, [first_name, last_name, email, user_type || 'client', phone, bio]);

    res.json({
      message: 'Utilisateur créé avec succès',
      user_id: result.insertId
    });

  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email déjà utilisé' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// ✅ Mettre à jour un utilisateur
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone, bio } = req.body;

    await pool.execute(`
      UPDATE users 
      SET first_name = ?, last_name = ?, email = ?, phone = ?, bio = ?, updated_at = NOW()
      WHERE id = ?
    `, [first_name, last_name, email, phone, bio, id]);

    res.json({ message: 'Utilisateur mis à jour avec succès' });

  } catch (error) {
    console.error('Erreur mise à jour utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Changer le statut d'un utilisateur
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const isActive = status === 'actif' ? 1 : 0;

    await pool.execute(`
      UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?
    `, [isActive, id]);

    res.json({ message: 'Statut mis à jour avec succès' });

  } catch (error) {
    console.error('Erreur changement statut:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Supprimer un utilisateur
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute('DELETE FROM users WHERE id = ?', [id]);

    res.json({ message: 'Utilisateur supprimé avec succès' });

  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Actions en lot
router.post('/bulk-action', authenticateToken, async (req, res) => {
  try {
    const { action, userIds } = req.body;

    if (!action || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: 'Action et IDs requis' });
    }

    const placeholders = userIds.map(() => '?').join(',');

    switch (action) {
      case 'activer':
        await pool.execute(
          `UPDATE users SET is_active = 1, updated_at = NOW() WHERE id IN (${placeholders})`,
          userIds
        );
        break;
      case 'desactiver':
        await pool.execute(
          `UPDATE users SET is_active = 0, updated_at = NOW() WHERE id IN (${placeholders})`,
          userIds
        );
        break;
      case 'supprimer':
        await pool.execute(
          `DELETE FROM users WHERE id IN (${placeholders})`,
          userIds
        );
        break;
      default:
        return res.status(400).json({ error: 'Action non supportée' });
    }

    res.json({ message: `Action ${action} effectuée sur ${userIds.length} utilisateur(s)` });

  } catch (error) {
    console.error('Erreur action en lot:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;