// scripts/create-admin.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const readline = require('readline');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'matrix_db'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function createSuperAdmin() {
  let connection;
  
  try {
    console.log('🔧 Création d\'un Super Administrateur MATRIX');
    console.log('=====================================\n');

    // Connexion à la base de données
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connexion à MySQL réussie\n');

    // Demander les informations de l'admin
    const email = await askQuestion('📧 Email de l\'administrateur: ');
    const password = await askQuestion('🔒 Mot de passe: ');
    const firstName = await askQuestion('👤 Prénom: ');
    const lastName = await askQuestion('👤 Nom: ');

    console.log('\n⏳ Création du compte administrateur...');

    // Vérifier si l'email existe déjà
    const [existingUsers] = await connection.execute(
      'SELECT id, user_type FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      if (user.user_type === 'admin') {
        console.log('ℹ️  Un administrateur avec cet email existe déjà.');
        
        const updateExisting = await askQuestion('🔄 Voulez-vous mettre à jour le mot de passe ? (y/N): ');
        
        if (updateExisting.toLowerCase() === 'y' || updateExisting.toLowerCase() === 'yes') {
          const hashedPassword = await bcrypt.hash(password, 10);
          
          await connection.execute(
            'UPDATE users SET password = ?, first_name = ?, last_name = ?, is_active = TRUE, email_verified = TRUE WHERE id = ?',
            [hashedPassword, firstName, lastName, user.id]
          );
          
          console.log('✅ Compte administrateur mis à jour avec succès !');
        } else {
          console.log('❌ Opération annulée.');
        }
      } else {
        console.log('❌ Un utilisateur avec cet email existe déjà mais n\'est pas administrateur.');
        console.log('💡 Utilisez un autre email ou supprimez le compte existant.');
      }
    } else {
      // Créer un nouveau compte admin
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const [result] = await connection.execute(
        `INSERT INTO users (email, password, user_type, first_name, last_name, is_active, email_verified, created_at, updated_at) 
         VALUES (?, ?, 'admin', ?, ?, TRUE, TRUE, NOW(), NOW())`,
        [email, hashedPassword, firstName, lastName]
      );

      console.log('✅ Super Administrateur créé avec succès !');
      console.log(`📋 ID: ${result.insertId}`);
      console.log(`📧 Email: ${email}`);
      console.log(`👤 Nom: ${firstName} ${lastName}`);
      console.log(`🔑 Type: admin`);
    }

    // Afficher tous les admins
    console.log('\n📋 Liste des administrateurs :');
    const [admins] = await connection.execute(
      'SELECT id, email, first_name, last_name, is_active, created_at FROM users WHERE user_type = "admin" ORDER BY created_at DESC'
    );

    admins.forEach((admin, index) => {
      const status = admin.is_active ? '🟢 Actif' : '🔴 Inactif';
      const date = new Date(admin.created_at).toLocaleDateString('fr-FR');
      console.log(`${index + 1}. ${admin.first_name} ${admin.last_name} (${admin.email}) - ${status} - Créé le ${date}`);
    });

    console.log('\n🎉 Vous pouvez maintenant vous connecter avec ces identifiants !');
    console.log('🔗 URL de connexion: http://localhost:8100/login');

  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'administrateur:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Assurez-vous que MySQL est démarré et que la base de données existe.');
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('💡 Exécutez d\'abord: npm run init-db');
    }
  } finally {
    if (connection) {
      await connection.end();
    }
    rl.close();
  }
}

// Fonction pour lister les admins existants
async function listAdmins() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    
    const [admins] = await connection.execute(
      'SELECT id, email, first_name, last_name, is_active, created_at FROM users WHERE user_type = "admin" ORDER BY created_at DESC'
    );

    if (admins.length === 0) {
      console.log('ℹ️  Aucun administrateur trouvé.');
      return;
    }

    console.log('📋 Administrateurs existants :');
    admins.forEach((admin, index) => {
      const status = admin.is_active ? '🟢 Actif' : '🔴 Inactif';
      const date = new Date(admin.created_at).toLocaleDateString('fr-FR');
      console.log(`${index + 1}. ${admin.first_name} ${admin.last_name} (${admin.email}) - ${status} - Créé le ${date}`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Gestion des arguments de ligne de commande
const args = process.argv.slice(2);

if (args.includes('--list') || args.includes('-l')) {
  listAdmins().then(() => process.exit(0));
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('🔧 Script de création d\'administrateur MATRIX');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/create-admin.js          # Créer ou modifier un admin');
  console.log('  node scripts/create-admin.js --list   # Lister les admins existants');
  console.log('  node scripts/create-admin.js --help   # Afficher cette aide');
  process.exit(0);
} else {
  createSuperAdmin();
}