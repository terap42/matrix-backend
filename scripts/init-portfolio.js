// init-portfolio.js - Script pour créer la table portfolio_projects

const mysql = require('mysql2/promise');
require('dotenv').config();

async function createPortfolioTable() {
  let connection;
  
  try {
    console.log('🔗 Connexion à la base de données...');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'matrix_db'
    });

    console.log('✅ Connexion établie');

    // Créer la table portfolio_projects
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS portfolio_projects (
          id INT AUTO_INCREMENT PRIMARY KEY,
          freelance_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          image_url VARCHAR(500) DEFAULT NULL,
          project_url VARCHAR(500) DEFAULT NULL,
          technologies JSON DEFAULT NULL,
          status ENUM('draft', 'published', 'archived') DEFAULT 'published',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          FOREIGN KEY (freelance_id) REFERENCES users(id) ON DELETE CASCADE,
          
          INDEX idx_freelance_id (freelance_id),
          INDEX idx_status (status),
          INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.execute(createTableQuery);
    console.log('✅ Table portfolio_projects créée avec succès');

    // Vérifier si des projets existent déjà
    const [existingProjects] = await connection.execute(
      'SELECT COUNT(*) as count FROM portfolio_projects'
    );

    if (existingProjects[0].count === 0) {
      console.log('📁 Ajout de projets d\'exemple...');
      
      // Récupérer les utilisateurs freelance pour les exemples
      const [freelances] = await connection.execute(
        'SELECT id FROM users WHERE user_type = "freelance" LIMIT 3'
      );
      
      if (freelances.length > 0) {
        const freelanceId = freelances[0].id;
        
        // Insérer des exemples de projets
        const insertExamples = `
          INSERT INTO portfolio_projects (freelance_id, title, description, image_url, project_url, technologies) VALUES
          (?, 'Site E-commerce React', 'Développement d\'une plateforme e-commerce moderne avec React et Node.js', 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop', 'https://github.com/exemple/ecommerce', '["React", "Node.js", "MongoDB", "Stripe"]'),
          (?, 'Application Mobile Flutter', 'Application mobile de gestion de tâches développée avec Flutter', 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop', 'https://github.com/exemple/taskapp', '["Flutter", "Dart", "Firebase", "SQLite"]'),
          (?, 'Dashboard Analytics', 'Tableau de bord d\'analytics en temps réel avec Vue.js et Chart.js', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop', 'https://github.com/exemple/dashboard', '["Vue.js", "Chart.js", "Express", "MySQL"]');
        `;
        
        await connection.execute(insertExamples, [freelanceId, freelanceId, freelanceId]);
        console.log('✅ Projets d\'exemple ajoutés pour le freelance ID:', freelanceId);
      } else {
        console.log('⚠️ Aucun freelance trouvé, pas d\'exemples ajoutés');
      }
    }

    // Vérifier la création
    const [projects] = await connection.execute(
      'SELECT id, title, freelance_id FROM portfolio_projects LIMIT 5'
    );
    
    console.log('📋 Projets dans la base :');
    if (projects.length > 0) {
      projects.forEach(project => {
        console.log(`  - ${project.title} (ID: ${project.id}, Freelance: ${project.freelance_id})`);
      });
    } else {
      console.log('  - Aucun projet trouvé');
    }

    console.log('🎉 Initialisation terminée avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation :', error);
    
    // Détails supplémentaires pour le debugging
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Vérifiez que MySQL est démarré');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Vérifiez vos identifiants MySQL dans le .env');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('💡 Vérifiez que la base de données existe');
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔒 Connexion fermée');
    }
  }
}

// Exécuter le script
createPortfolioTable();