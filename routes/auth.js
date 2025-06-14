// ✅ AJOUTEZ cette route temporaire dans routes/auth.js ou créez-la

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

// ✅ Route de login temporaire pour tester MATRIX
router.post('/test-login', async (req, res) => {
  try {
    console.log('🧪 === ROUTE TEST LOGIN MATRIX ===');
    
    const { email, password } = req.body;
    console.log('🔍 Tentative de connexion:', email);
    
    // Chercher l'utilisateur dans la base
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    
    if (users.length === 0) {
      console.log('❌ Utilisateur non trouvé ou inactif');
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    const user = users[0];
    console.log('✅ Utilisateur trouvé:', {
      id: user.id,
      email: user.email,
      user_type: user.user_type
    });
    
    // Pour le test, on skip la vérification du mot de passe
    // En production, utilisez: const validPassword = await bcrypt.compare(password, user.password);
    
    // Générer le token JWT MATRIX
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        first_name: user.first_name,
        last_name: user.last_name
      },
      process.env.JWT_SECRET || 'matrix-secret-key-change-me',
      { expiresIn: '24h' }
    );
    
    console.log('✅ Token JWT généré pour:', user.email);
    
    // Retourner les données comme attendu par le frontend
    res.json({
      message: 'Connexion réussie',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        user_type: user.user_type,
        avatar: user.avatar,
        is_active: user.is_active
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur login test:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// ✅ Route pour créer un utilisateur admin rapidement
router.post('/create-admin', async (req, res) => {
  try {
    console.log('👑 === CRÉATION ADMIN MATRIX ===');
    
    const { email, password, first_name, last_name } = req.body;
    
    // Vérifier si l'utilisateur existe déjà
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existing.length > 0) {
      // Mettre à jour en admin
      await pool.execute(
        'UPDATE users SET user_type = ? WHERE email = ?',
        ['admin', email]
      );
      console.log('✅ Utilisateur existant mis à jour en admin');
    } else {
      // Créer nouvel admin
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await pool.execute(`
        INSERT INTO users (
          first_name, last_name, email, password, user_type, 
          is_active, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())
      `, [first_name, last_name, email, hashedPassword]);
      
      console.log('✅ Nouvel admin créé');
    }
    
    res.json({ message: 'Admin créé/mis à jour avec succès' });
    
  } catch (error) {
    console.error('❌ Erreur création admin:', error);
    res.status(500).json({ error: 'Erreur création admin' });
  }
});

module.exports = router;