// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Fonction pour générer un token JWT
const generateToken = (userId, email, userType) => {
  return jwt.sign(
    { 
      userId: userId, 
      email: email, 
      user_type: userType 
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Inscription
const register = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      user_type, 
      first_name, 
      last_name, 
      phone,
      location,
      bio 
    } = req.body;

    // Validation des données
    if (!email || !password || !user_type || !first_name || !last_name) {
      return res.status(400).json({ 
        error: 'Tous les champs obligatoires doivent être remplis' 
      });
    }

    // Vérifier si l'email est valide
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Format d\'email invalide' 
      });
    }

    // Vérifier la longueur du mot de passe
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Le mot de passe doit contenir au moins 6 caractères' 
      });
    }

    // Vérifier si l'utilisateur existe déjà
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        error: 'Un compte avec cet email existe déjà' 
      });
    }

    // Hasher le mot de passe
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insérer le nouvel utilisateur
    const [result] = await pool.execute(
      `INSERT INTO users (email, password, user_type, first_name, last_name, phone, location, bio, is_active, email_verified) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, FALSE)`,
      [email, hashedPassword, user_type, first_name, last_name, phone || null, location || null, bio || null]
    );

    const userId = result.insertId;

    // Si c'est un freelance, créer son profil freelance
    if (user_type === 'freelance') {
      await pool.execute(
        `INSERT INTO freelance_profiles (user_id, hourly_rate, availability, experience_years, completed_missions, average_rating, total_earnings, response_time_hours) 
         VALUES (?, NULL, TRUE, 0, 0, 0, 0, 24)`,
        [userId]
      );
    }

    // Générer le token JWT
    const token = generateToken(userId, email, user_type);

    res.status(201).json({
      message: 'Inscription réussie',
      token: token,
      user: {
        id: userId,
        email: email,
        user_type: user_type,
        first_name: first_name,
        last_name: last_name
      }
    });

  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// Connexion
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation des données
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email et mot de passe requis' 
      });
    }

    // Rechercher l'utilisateur
    const [users] = await pool.execute(
      `SELECT id, email, password, user_type, first_name, last_name, is_active 
       FROM users WHERE email = ?`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        error: 'Identifiants incorrects' 
      });
    }

    const user = users[0];

    // Vérifier si le compte est actif
    if (!user.is_active) {
      return res.status(401).json({ 
        error: 'Compte désactivé' 
      });
    }

    // Vérifier le mot de passe
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Identifiants incorrects' 
      });
    }

    // Générer le token JWT
    const token = generateToken(user.id, user.email, user.user_type);

    res.json({
      message: 'Connexion réussie',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });

  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// Obtenir le profil utilisateur
const getProfile = async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, email, user_type, first_name, last_name, avatar, bio, location, phone, website, created_at 
       FROM users WHERE id = ?`,
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = users[0];

    // Si c'est un freelance, récupérer son profil
    if (user.user_type === 'freelance') {
      const [profiles] = await pool.execute(
        `SELECT hourly_rate, availability, experience_years, completed_missions, average_rating, total_earnings, response_time_hours 
         FROM freelance_profiles WHERE user_id = ?`,
        [user.id]
      );

      if (profiles.length > 0) {
        user.freelance_profile = profiles[0];
      }
    }

    res.json({ user });

  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// Déconnexion
const logout = (req, res) => {
  res.json({ message: 'Déconnexion réussie' });
};

module.exports = {
  register,
  login,
  getProfile,
  logout
};