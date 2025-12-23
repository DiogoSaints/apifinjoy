const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 80;

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

// Middleware to extract user from JWT
const extractUser = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            // Decode without verification for now (Supabase tokens are pre-validated)
            const decoded = jwt.decode(token);
            if (decoded && decoded.sub) {
                req.userId = decoded.sub;
                req.userEmail = decoded.email;
            }
        } catch (err) {
            console.error('JWT decode error:', err.message);
        }
    }
    next();
};

app.use(extractUser);

// Health check route
app.get('/', (req, res) => {
    res.send('API is running ok');
});

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

// Helper to ensure user exists in database
const ensureUser = async (userId, email = null) => {
    if (!userId) return;

    try {
        // Check if user exists
        const { rows } = await query('SELECT id FROM users WHERE id = $1', [userId]);

        if (rows.length === 0) {
            // Create user if doesn't exist
            await query(
                'INSERT INTO users (id, email, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
                [userId, email]
            );
            console.log(`User ${userId} created in database`);
        }
    } catch (err) {
        console.error('Error ensuring user exists:', err.message);
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
        // Ensure user exists
        await ensureUser(user_id);

        const { rows } = await query(
            'INSERT INTO accounts (user_id, name, type, balance, color, icon) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [user_id, name, type, balance, color, icon]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Users - Sync endpoint
app.post('/users/sync', async (req, res) => {
    const { id, email } = req.body;
    try {
        await ensureUser(id, email);
        res.json({ success: true, message: 'User synced' });
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
    let { user_id, account_id, category_id, type, description, amount, date, payment_method } = req.body;

    // Convert empty strings to null for UUID fields
    account_id = account_id || null;
    category_id = category_id || null;
    user_id = user_id || null;

    const client = await pool.connect();
    try {
        // Ensure user exists first
        await ensureUser(user_id);

        await client.query('SET search_path TO finance_app, public');
        await client.query('BEGIN');

        // Insert Transaction
        const { rows } = await client.query(
            'INSERT INTO transactions (user_id, account_id, category_id, type, description, amount, date, payment_method) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [user_id, account_id, category_id, type, description, amount, date, payment_method]
        );

        // Update Account Balance (only if account_id is valid)
        if (account_id && account_id.length > 0) {
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

// Categories
app.get('/categories', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM categories');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/categories', async (req, res) => {
    const { user_id, name, icon, type, color, is_default } = req.body;
    try {
        const { rows } = await query(
            'INSERT INTO categories (user_id, name, icon, type, color, is_default) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [user_id, name, icon, type, color, is_default || false]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Recurring Transactions
app.get('/recurring_transactions', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM recurring_transactions');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/recurring_transactions', async (req, res) => {
    const { user_id, account_id, category_id, type, description, amount, payment_method, frequency, start_date, end_date, next_date } = req.body;
    try {
        const { rows } = await query(
            'INSERT INTO recurring_transactions (user_id, account_id, category_id, type, description, amount, payment_method, frequency, start_date, end_date, next_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
            [user_id, account_id, category_id, type, description, amount, payment_method, frequency, start_date, end_date, next_date]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Goals
app.get('/goals', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM goals');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/goals', async (req, res) => {
    const { user_id, name, target_amount, current_amount, start_date, deadline, status } = req.body;
    try {
        const { rows } = await query(
            'INSERT INTO goals (user_id, name, target_amount, current_amount, start_date, deadline, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [user_id, name, target_amount, current_amount || 0, start_date, deadline, status || 'active']
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Budgets
app.get('/budgets', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM budgets');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/budgets', async (req, res) => {
    const { user_id, category_id, amount, month, year } = req.body;
    try {
        const { rows } = await query(
            'INSERT INTO budgets (user_id, category_id, amount, month, year) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [user_id, category_id, amount, month, year]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Subscriptions
app.get('/subscriptions/me', async (req, res) => {
    // Placeholder - return empty for now
    res.json(null);
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
