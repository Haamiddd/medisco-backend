require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(cors());

// Database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medisco_chatbot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS solution');
        res.json({ message: 'Database connection successful', solution: rows[0].solution });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all departments
app.get('/api/departments', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM departments');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get doctors by specialization
app.get('/api/doctors', async (req, res) => {
    const { specialization } = req.query;
    try {
        let query = 'SELECT id, name, specialization, available_days, available_times FROM doctors';
        let params = [];
        
        if (specialization) {
            query += ' WHERE specialization LIKE ?';
            params.push(`%${specialization}%`);
        }
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get doctor availability
app.get('/api/doctors/:id/availability', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT available_days, available_times FROM doctors WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Doctor not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check appointment availability
app.get('/api/appointments/availability', async (req, res) => {
    const { doctorId, date } = req.query;
    try {
        const [rows] = await pool.query(
            'SELECT appointment_time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status = "scheduled"',
            [doctorId, date]
        );
        const bookedTimes = rows.map(row => row.appointment_time);
        res.json({ bookedTimes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Book appointment
app.post('/api/appointments', async (req, res) => {
    const { patient_name, patient_email, patient_phone, doctor_id, appointment_date, appointment_time } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO appointments (patient_name, patient_email, patient_phone, doctor_id, appointment_date, appointment_time) VALUES (?, ?, ?, ?, ?, ?)',
            [patient_name, patient_email, patient_phone, doctor_id, appointment_date, appointment_time]
        );
        res.json({ 
            message: 'Appointment booked successfully',
            appointmentId: result.insertId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get FAQs
app.get('/api/faqs', async (req, res) => {
    const { category } = req.query;
    try {
        let query = 'SELECT * FROM faqs';
        let params = [];
        
        if (category) {
            query += ' WHERE category = ?';
            params.push(category);
        }
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Symptom checker (basic AI)
app.post('/api/symptom-checker', async (req, res) => {
  const { symptoms } = req.body;
  const symptomText = symptoms.toLowerCase();

  // Symptom-response mapping
  const symptomAdvice = [
    {
      keywords: ['chest pain', 'difficulty breathing', 'severe bleeding'],
      recommendation: 'You should visit the emergency department immediately. These symptoms may indicate a serious condition.',
      urgency: 'high'
    },
    {
      keywords: ['fever'],
      recommendation: 'Take Paracetamol (500mg) every 6 hours as needed for fever. Stay hydrated and rest. If fever persists beyond 48 hours, see a doctor.',
      urgency: 'medium'
    },
    {
      keywords: ['headache'],
      recommendation: 'You can take Panadol (500mg) or Ibuprofen for headache relief. Ensure you stay hydrated and rest in a quiet, dark room.',
      urgency: 'low'
    },
    {
      keywords: ['cough'],
      recommendation: 'Drink warm water with honey and lemon. You can also take a cough syrup like Benylin. If cough lasts more than 3 days, consult a doctor.',
      urgency: 'medium'
    },
    {
      keywords: ['sore throat'],
      recommendation: 'Gargle with warm salt water and drink warm fluids. Lozenges can help relieve discomfort.',
      urgency: 'low'
    },
    {
      keywords: ['stomach pain'],
      recommendation: 'Avoid spicy foods and take an antacid like Gaviscon. If pain persists or is severe, see a doctor.',
      urgency: 'medium'
    },
    {
      keywords: ['nausea'],
      recommendation: 'Drink clear fluids like ginger tea or oral rehydration solutions. Avoid heavy meals.',
      urgency: 'low'
    },
    {
      keywords: ['diarrhea'],
      recommendation: 'Stay hydrated with oral rehydration salts. Avoid dairy and oily foods. If it lasts over 2 days, see a doctor.',
      urgency: 'medium'
    }
  ];

  let foundMatch = false;
  let recommendation = 'Based on your symptoms, home care may be appropriate. However, if symptoms worsen, please contact a doctor.';
  let urgency = 'low';

  for (let item of symptomAdvice) {
    for (let keyword of item.keywords) {
      if (symptomText.includes(keyword)) {
        recommendation = item.recommendation;
        urgency = item.urgency;
        foundMatch = true;
        break;
      }
    }
    if (foundMatch) break;
  }

  res.json({ recommendation, urgency });
});

// Save chat history for learning
app.post('/api/chat-history', async (req, res) => {
    const { user_input, bot_response } = req.body;
    try {
        await pool.query(
            'INSERT INTO chat_history (user_input, bot_response) VALUES (?, ?)',
            [user_input, bot_response]
        );
        res.json({ message: 'Chat history saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update chat history feedback for learning
app.put('/api/chat-history/:id/feedback', async (req, res) => {
    const { id } = req.params;
    const { is_correct } = req.body;
    try {
        await pool.query(
            'UPDATE chat_history SET is_correct = ? WHERE id = ?',
            [is_correct, id]
        );
        res.json({ message: 'Feedback received' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get angry response for irrelevant questions
app.get('/api/angry-response', async (req, res) => {
    const responses = [
        "I'm here to help with hospital-related questions!",
        "Please ask relevant questions about Medisco Hospital! ",
        "That's not what I'm programmed for! Stick to hospital queries!",
    ];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    res.json({ response: randomResponse });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Add these new endpoints to your existing server code:

// Get doctor by name or specialization
app.get('/api/doctors/availability', async (req, res) => {
    const { name, day } = req.query;
    try {
        let query = `
            SELECT d.*, 
                   GROUP_CONCAT(DISTINCT a.appointment_time) AS booked_times
            FROM doctors d
            LEFT JOIN appointments a ON d.id = a.doctor_id 
                AND a.appointment_date = ? 
                AND a.status = 'scheduled'
            WHERE d.name LIKE ? OR d.specialization LIKE ?
            GROUP BY d.id
        `;
        
        // Format the date properly (assuming day is 'today', 'tomorrow', or a weekday)
        let date;
        if (day === 'today') {
            date = new Date().toISOString().split('T')[0];
        } else if (day === 'tomorrow') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            date = tomorrow.toISOString().split('T')[0];
        } else {
            // For weekdays, find the next occurrence of that day
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayIndex = days.indexOf(day.toLowerCase());
            if (dayIndex === -1) {
                return res.status(400).json({ error: 'Invalid day specified' });
            }
            
            const today = new Date();
            const currentDay = today.getDay();
            let daysToAdd = (dayIndex - currentDay + 7) % 7;
            daysToAdd = daysToAdd === 0 ? 7 : daysToAdd; // If today is the day, show next week
            today.setDate(today.getDate() + daysToAdd);
            date = today.toISOString().split('T')[0];
        }
        
        const [rows] = await pool.query(query, [
            date,
            `%${name}%`,
            `%${name}%`
        ]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No matching doctors found' });
        }
        
        // Process the results to show availability
        const results = rows.map(doctor => {
            const bookedTimes = doctor.booked_times ? doctor.booked_times.split(',') : [];
            const allTimes = doctor.available_times.split(',').map(t => t.trim());
            const availableTimes = allTimes.filter(time => !bookedTimes.includes(time));
            
            // Check if the requested day is in the doctor's available days
            const availableDays = doctor.available_days.toLowerCase().split(',').map(d => d.trim());
            const requestedDay = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            const isAvailable = availableDays.some(d => d.includes(requestedDay));
            
            return {
                id: doctor.id,
                name: doctor.name,
                specialization: doctor.specialization,
                available: isAvailable,
                availableTimes: isAvailable ? availableTimes : [],
                availableDays: doctor.available_days,
                bookedTimes
            };
        });
        
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get latest appointment for a patient
app.get('/api/appointments/latest', async (req, res) => {
    const { email, name } = req.query;
    try {
        let query = `
            SELECT a.*, d.name AS doctor_name
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            WHERE (a.patient_email = ? OR a.patient_name LIKE ?)
            AND a.appointment_date >= CURDATE()
            AND a.status = 'scheduled'
            ORDER BY a.appointment_date, a.appointment_time
            LIMIT 1
        `;
        
        const [rows] = await pool.query(query, [
            email || '',
            `%${name}%`
        ]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No upcoming appointments found' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get appointment reminders (for the frontend's initial check)
app.get('/api/appointments/reminders', async (req, res) => {
    try {
        // Get appointments happening in the next 24 hours
        const [rows] = await pool.query(`
            SELECT a.*, d.name AS doctor_name
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            AND a.status = 'scheduled'
            ORDER BY a.appointment_date, a.appointment_time
        `);
        
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

///////////////////////

// In your backend (server.js), update the /api/doctors/available-today endpoint:
app.get('/api/doctors/available-today', async (req, res) => {
    try {
        const today = new Date();
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const todayDate = today.toISOString().split('T')[0];

        // Get doctors available today with their available slots
        const [results] = await pool.query(`
            SELECT 
                d.id,
                d.name,
                d.specialization,
                d.available_times,
                GROUP_CONCAT(a.appointment_time) AS booked_times
            FROM doctors d
            LEFT JOIN appointments a ON d.id = a.doctor_id 
                AND a.appointment_date = ? 
                AND a.status = 'scheduled'
            WHERE LOWER(d.available_days) LIKE ?
            GROUP BY d.id
        `, [todayDate, `%${dayName}%`]);

        const availableDoctors = results.map(doctor => {
            const bookedTimes = doctor.booked_times ? doctor.booked_times.split(',') : [];
            const allTimes = doctor.available_times.split(',').map(t => t.trim());
            const availableTimes = allTimes.filter(time => !bookedTimes.includes(time));
            
            return {
                id: doctor.id,
                name: doctor.name.replace('Dr. ', '').replace('Dr ', ''), // Remove duplicate Dr. prefixes
                specialization: doctor.specialization,
                availableTimes
            };
        }).filter(doctor => doctor.availableTimes.length > 0);

        res.json(availableDoctors);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get doctor availability with more detailed information
app.get('/api/doctors/available-today', async (req, res) => {
    try {
        const today = new Date();
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const todayDate = today.toISOString().split('T')[0];

        const [results] = await pool.query(`
            SELECT 
                d.id,
                d.name,
                d.specialization,
                d.available_times,
                GROUP_CONCAT(a.appointment_time) AS booked_times
            FROM doctors d
            LEFT JOIN appointments a ON d.id = a.doctor_id 
                AND a.appointment_date = ? 
                AND a.status = 'scheduled'
            WHERE LOWER(d.available_days) LIKE ?
            GROUP BY d.id
        `, [todayDate, `%${dayName}%`]);

        const availableDoctors = results.map(doctor => {
            const bookedTimes = doctor.booked_times ? doctor.booked_times.split(',') : [];
            const allTimes = doctor.available_times.split(',').map(t => t.trim());
            const availableTimes = allTimes.filter(time => !bookedTimes.includes(time));
            
            return {
                id: doctor.id,
                name: doctor.name.replace('Dr. ', '').replace('Dr ', ''),
                specialization: doctor.specialization,
                availableTimes
            };
        }).filter(doctor => doctor.availableTimes.length > 0);

        res.json(availableDoctors);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
// Get doctor details by ID
app.get('/api/doctors/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM doctors WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Doctor not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});