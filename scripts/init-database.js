// scripts/init-database.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

const DATABASE_NAME = process.env.DB_NAME || 'matrix_db';

async function initDatabase() {
  let connection;
  
  try {
    console.log('🔗 Connexion à MySQL...');
    connection = await mysql.createConnection(dbConfig);
    
    // Créer la base de données (en utilisant .query() au lieu de .execute())
    console.log('📊 Création de la base de données...');
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME}`);
    await connection.query(`USE ${DATABASE_NAME}`);
    
    console.log('📋 Création des tables...');
    
    // Création des tables avec gestion explicite des erreurs
    const tables = [
      `
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        user_type ENUM('freelance', 'client', 'admin') NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        avatar VARCHAR(500),
        bio TEXT,
        location VARCHAR(255),
        phone VARCHAR(20),
        website VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
      `,
      `
      CREATE TABLE IF NOT EXISTS freelance_profiles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        hourly_rate DECIMAL(10,2),
        availability BOOLEAN DEFAULT TRUE,
        experience_years INT DEFAULT 0,
        completed_missions INT DEFAULT 0,
        average_rating DECIMAL(3,2) DEFAULT 0,
        total_earnings DECIMAL(12,2) DEFAULT 0,
        response_time_hours INT DEFAULT 24,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      `
      CREATE TABLE IF NOT EXISTS skills (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL
      ) ENGINE=InnoDB
      `,
      `
      CREATE TABLE IF NOT EXISTS user_skills (
        user_id INT,
        skill_id INT,
        proficiency ENUM('beginner', 'intermediate', 'expert') DEFAULT 'intermediate',
        PRIMARY KEY (user_id, skill_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      `
      CREATE TABLE IF NOT EXISTS missions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        budget_min DECIMAL(10,2),
        budget_max DECIMAL(10,2),
        budget_type ENUM('fixed', 'hourly') DEFAULT 'fixed',
        currency VARCHAR(3) DEFAULT 'EUR',
        deadline DATE,
        client_id INT NOT NULL,
        assigned_freelance_id INT NULL,
        status ENUM('open', 'assigned', 'in_progress', 'completed', 'cancelled') DEFAULT 'open',
        is_remote BOOLEAN DEFAULT TRUE,
        location VARCHAR(255),
        experience_level ENUM('beginner', 'intermediate', 'expert') DEFAULT 'intermediate',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_freelance_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
      `,
      `
      CREATE TABLE IF NOT EXISTS applications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        mission_id INT NOT NULL,
        freelance_id INT NOT NULL,
        proposal TEXT NOT NULL,
        proposed_budget DECIMAL(10,2),
        proposed_deadline DATE,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
        FOREIGN KEY (freelance_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_application (mission_id, freelance_id)
      ) ENGINE=InnoDB
      `
    ];

    for (const tableSql of tables) {
      try {
        await connection.query(tableSql);
      } catch (err) {
        console.error(`Erreur lors de la création d'une table:`, err);
        throw err;
      }
    }
    
    console.log('👤 Création des utilisateurs de test...');
    
    // Hachage des mots de passe en parallèle
    const [adminPassword, userPassword, freelancePassword] = await Promise.all([
      bcrypt.hash('admin', 10),
      bcrypt.hash('user', 10),
      bcrypt.hash('freelance', 10)
    ]);
    
    
    await connection.beginTransaction();
    
    try {
      // Admin
      const [adminResult] = await connection.execute(
        `INSERT INTO users (email, password, user_type, first_name, last_name, is_active, email_verified) 
         VALUES (?, ?, 'admin', 'Admin', 'MATRIX', TRUE, TRUE)
         ON DUPLICATE KEY UPDATE email = email`,
        ['admin@matrix.com', adminPassword]
      );
      
      // Client
      const [clientResult] = await connection.execute(
        `INSERT INTO users (email, password, user_type, first_name, last_name, bio, location, is_active, email_verified) 
         VALUES (?, ?, 'client', 'Client', 'Test', ?, ?, TRUE, TRUE)
         ON DUPLICATE KEY UPDATE email = email`,
        ['client@matrix.com', userPassword, 
         'Je suis un client à la recherche de freelances talentueux', 'Paris, France']
      );
      
      // Freelance
      const [freelanceResult] = await connection.execute(
        `INSERT INTO users (email, password, user_type, first_name, last_name, bio, location, phone, is_active, email_verified) 
         VALUES (?, ?, 'freelance', 'Freelance', 'Test', ?, ?, ?, TRUE, TRUE)
         ON DUPLICATE KEY UPDATE email = email`,
        ['freelance@matrix.com', freelancePassword, 
         'Développeur Full-Stack passionné avec 5 ans d\'expérience', 'Lyon, France', '+33123456789']
      );
      
      // Récupération des IDs (même si l'utilisateur existait déjà)
      const [existingFreelance] = await connection.execute(
        `SELECT id FROM users WHERE email = ?`,
        ['freelance@matrix.com']
      );
      
      if (existingFreelance.length > 0) {
        await connection.execute(
          `INSERT INTO freelance_profiles 
           (user_id, hourly_rate, availability, experience_years, completed_missions, average_rating, total_earnings, response_time_hours) 
           VALUES (?, 45.00, TRUE, 5, 12, 4.8, 15000.00, 2)
           ON DUPLICATE KEY UPDATE user_id = user_id`,
          [existingFreelance[0].id]
        );
      }
      
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }
    
    console.log('🛠️ Ajout des compétences...');
    const skills = [
      ['JavaScript', 'Développement'],
      ['Angular', 'Développement'],
      ['Node.js', 'Développement'],
      ['React', 'Développement'],
      ['PHP', 'Développement'],
      ['Python', 'Développement'],
      ['UI/UX Design', 'Design'],
      ['Photoshop', 'Design'],
      ['Figma', 'Design'],
      ['Rédaction web', 'Contenu'],
      ['SEO', 'Marketing'],
      ['Marketing digital', 'Marketing']
    ];
    
    // Insertion par lot plus efficace
    const skillValues = skills.map(([name, category]) => [name, category]);
    await connection.query(
      `INSERT IGNORE INTO skills (name, category) VALUES ?`,
      [skillValues]
    );
    
    console.log('✅ Base de données initialisée avec succès !');
    console.log('\n📝 Comptes de test :');
    console.log('   - Admin: admin@matrix.com / admin');
    console.log('   - Client: client@matrix.com / user');
    console.log('   - Freelance: freelance@matrix.com / freelance');
    console.log('\n🔗 Connexion MySQL:');
    console.log(`   - Hôte: ${dbConfig.host}`);
    console.log(`   - Base: ${DATABASE_NAME}`);
    
  } catch (error) {
    console.error('❌ Erreur critique:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🚪 Connexion MySQL fermée');
    }
  }
}

// Gestion des erreurs non catchées
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Erreur non gérée:', err);
  process.exit(1);
});

initDatabase();