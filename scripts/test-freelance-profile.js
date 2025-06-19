// test-freelance-profile.js - Script de test pour vérifier les corrections
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';

async function testAPI() {
  try {
    console.log('🧪 DÉBUT DES TESTS API FREELANCE-PROFILE\n');

    // 1. Test de connexion
    console.log('1️⃣ Test de connexion...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'ali@gmail.com',
      password: 'Ndjamena2020'
    });

    authToken = loginResponse.data.token;
    console.log('✅ Connexion réussie\n');

    const headers = {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Test de santé
    console.log('2️⃣ Test de santé API...');
    const healthResponse = await axios.get(`${BASE_URL}/freelance-profile/health`);
    console.log('✅ API en bonne santé:', healthResponse.data.status);
    console.log('📋 Endpoints disponibles:', healthResponse.data.endpoints.length);
    console.log('');

    // 3. Test récupération profil
    console.log('3️⃣ Test récupération profil...');
    const profileResponse = await axios.get(`${BASE_URL}/freelance-profile`, { headers });
    console.log('✅ Profil récupéré:', profileResponse.data.profile.fullName);
    console.log('🎯 Compétences actuelles:', profileResponse.data.profile.skills.length);
    console.log('📁 Projets portfolio:', profileResponse.data.profile.portfolio.length);
    console.log('');

    // 4. Test mise à jour profil avec compétences CORRIGÉES
    console.log('4️⃣ Test mise à jour profil avec compétences...');
    const updateData = {
      fullName: 'Alexandre Martin Dev',
      title: 'Développeur Full-Stack Senior',
      bio: 'Développeur Full-Stack passionné avec 6 ans d\'expérience en React, Node.js et PHP. Spécialisé dans la création d\'applications web modernes, APIs RESTful et solutions cloud.',
      hourlyRate: 55,
      availability: true,
      experienceYears: 6,
      responseTimeHours: 2,
      skills: [
        { name: 'React', level: 'expert' },
        { name: 'Node.js', level: 'avance' },
        { name: 'TypeScript', level: 'avance' },
        { name: 'JavaScript', level: 'expert' },
        { name: 'MongoDB', level: 'intermediaire' },
        { name: 'Docker', level: 'intermediaire' },
        { name: 'AWS', level: 'debutant' }
      ]
    };

    const updateResponse = await axios.put(`${BASE_URL}/freelance-profile`, updateData, { headers });
    console.log('✅ Profil mis à jour:', updateResponse.data.message);
    console.log('🎯 Nouvelles compétences:', updateResponse.data.profile.skills.length);
    console.log('');

    // 5. Test ajout compétence individuelle
    console.log('5️⃣ Test ajout compétence individuelle...');
    const newSkillResponse = await axios.post(`${BASE_URL}/freelance-profile/skills`, {
      name: 'GraphQL',
      level: 'intermediaire'
    }, { headers });
    console.log('✅ Compétence ajoutée:', newSkillResponse.data.skill.name);
    console.log('');

    // 6. Test ajout projet portfolio
    console.log('6️⃣ Test ajout projet portfolio...');
    const newProjectResponse = await axios.post(`${BASE_URL}/freelance-profile/portfolio`, {
      title: 'API GraphQL E-commerce',
      description: 'Développement d\'une API GraphQL moderne pour une plateforme e-commerce avec authentification JWT, gestion des stocks en temps réel et intégration Stripe.',
      imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=300&fit=crop',
      projectUrl: 'https://github.com/alexandre/graphql-ecommerce',
      technologies: ['GraphQL', 'Node.js', 'PostgreSQL', 'Stripe', 'JWT']
    }, { headers });
    console.log('✅ Projet ajouté:', newProjectResponse.data.project.title);
    console.log('🔧 Technologies:', newProjectResponse.data.project.technologies.join(', '));
    console.log('');

    // 7. Test statistiques
    console.log('7️⃣ Test récupération statistiques...');
    const statsResponse = await axios.get(`${BASE_URL}/freelance-profile/stats`, { headers });
    console.log('✅ Statistiques récupérées:');
    console.log('   📊 Missions complétées:', statsResponse.data.stats.completed_missions);
    console.log('   ⭐ Note moyenne:', statsResponse.data.stats.average_rating);
    console.log('   💰 Gains totaux:', statsResponse.data.stats.total_earnings, '€');
    console.log('   ⏱️ Temps de réponse:', statsResponse.data.stats.response_time_hours, 'h');
    console.log('');

    // 8. Test final - récupération profil complet
    console.log('8️⃣ Test final - profil complet...');
    const finalProfileResponse = await axios.get(`${BASE_URL}/freelance-profile`, { headers });
    const finalProfile = finalProfileResponse.data.profile;
    console.log('✅ PROFIL FINAL RÉCUPÉRÉ:');
    console.log('   👤 Nom:', finalProfile.fullName);
    console.log('   💼 Titre:', finalProfile.title);
    console.log('   💵 Tarif horaire:', finalProfile.hourlyRate, '€/h');
    console.log('   📅 Expérience:', finalProfile.experienceYears, 'ans');
    console.log('   🎯 Compétences:', finalProfile.skills.length);
    finalProfile.skills.forEach(skill => {
      console.log(`      - ${skill.name} (${skill.level})`);
    });
    console.log('   📁 Projets portfolio:', finalProfile.portfolio.length);
    finalProfile.portfolio.forEach(project => {
      console.log(`      - ${project.title} (${project.technologies.length} techs)`);
    });
    console.log('');

    console.log('🎉 TOUS LES TESTS RÉUSSIS ! L\'API FONCTIONNE CORRECTEMENT');

  } catch (error) {
    console.error('❌ ERREUR DURANT LES TESTS:');
    if (error.response) {
      console.error('   📋 Status:', error.response.status);
      console.error('   📋 Message:', error.response.data?.message || error.response.data);
      console.error('   📋 Erreur:', error.response.data?.error);
    } else {
      console.error('   📋 Erreur:', error.message);
    }
  }
}

// Lancer les tests
testAPI();