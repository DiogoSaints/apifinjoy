const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Database connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

app.use(cors());
app.use(express.json());

// Middleware to set search path for every request/connection
// Note: In high traffic, setting this per query or on connection init is better.
// For this stub, we'll prefix queries or strict search_path.
// Let's use a helper to query with the right path.
const query = async (text, params) => {
    const client = await pool.connect();
    try {
        await client.query('SET search_path TO finance_app, public');
        const res = await client.query(text, params);
        return res;
    } finally {
        client.release();
    }
};

// Routes

// Accounts
app.get('/accounts', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM accounts');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/accounts', async (req, res) => {
    const { user_id, name, type, balance, color, icon } = req.body;
    try {
        const { rows } = await query(
            'INSERT INTO accounts (user_id, name, type, balance, color, icon) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [user_id, name, type, balance, color, icon]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Transactions
app.get('/transactions', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM transactions ORDER BY date DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/transactions', async (req, res) => {
    const { user_id, account_id, category_id, type, description, amount, date, payment_method } = req.body;

    const client = await pool.connect();
    try {
        await client.query('SET search_path TO finance_app, public');
        await client.query('BEGIN');

        // Insert Transaction
        const { rows } = await client.query(
            'INSERT INTO transactions (user_id, account_id, category_id, type, description, amount, date, payment_method) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [user_id, account_id, category_id, type, description, amount, date, payment_method]
        );

        // Update Account Balance
        if (account_id) {
            if (type === 'income') {
                await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, account_id]);
            } else {
                await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, account_id]);
            }
        }

        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Settings (WhatsApp)
app.post('/settings', async (req, res) => {
    const { whatsapp_number } = req.body;
    // Here you would save to user_settings table
    // For now logging it to verify flow
    console.log('Received WhatsApp Number:', whatsapp_number);
    // TODO: Implement insert/update to user_settings
    res.json({ success: true, whatsapp_number });
});

app.get('/settings', async (req, res) => {
    // Return dummy or fetch from DB
    res.json({ whatsapp_number: null });
});

// Categories, Recurring, etc. would follow similar patterns...

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
