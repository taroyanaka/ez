const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  user: 'ez',
  host: 'localhost',
  database: 'ezdb',
  password: 'postgres',
  port: 5432,
});

app.use(cors());
app.use(express.json());

// List of allowed resources (tables)
const resources = ['chunks', 'flashcards', 'fill_in_the_blank', 'reading_quizzes'];

console.log('Available resources in PostgreSQL:');
resources.forEach(res => console.log(`- /${res}`));

// Dynamic CRUD routes for each resource

// GET all items
app.get('/:resource', async (req, res) => {
  const { resource } = req.params;
  if (!resources.includes(resource)) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const idCol = (resource === 'flashcards' || resource === 'chunks') ? 'id' : 'id_key';

  try {
    let query = `SELECT * FROM ${resource}`;
    const queryParams = [];

    if (resource === 'flashcards' && req.query.chunk_id) {
      query += ` WHERE chunk_id = $1`;
      queryParams.push(req.query.chunk_id);
    }

    query += ` ORDER BY ${idCol} ASC`;
    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching ${resource}:`, error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET an item by id
app.get('/:resource/:id', async (req, res) => {
  const { resource, id } = req.params;
  if (!resources.includes(resource)) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const idCol = (resource === 'flashcards' || resource === 'chunks') ? 'id' : 'id_key';
  
  try {
    const result = await pool.query(`SELECT * FROM ${resource} WHERE ${idCol} = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error fetching item from ${resource}:`, error);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST to create a new item
app.post('/:resource', async (req, res) => {
  const { resource } = req.params;
  if (!resources.includes(resource)) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const keys = Object.keys(req.body);
  const values = Object.values(req.body).map(val => 
    (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val
  );
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const columns = keys.join(', ');

  try {
    const query = `INSERT INTO ${resource} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const result = await pool.query(query, values);
    const idCol = (resource === 'flashcards' || resource === 'chunks') ? 'id' : 'id_key';
    res.status(201).json({ 
      message: 'Item created', 
      item: result.rows[0], 
      id: result.rows[0][idCol] 
    });
  } catch (error) {
    console.error(`Error creating item in ${resource}:`, error);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT to update an item by id
app.put('/:resource/:id', async (req, res) => {
  const { resource, id } = req.params;
  if (!resources.includes(resource)) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const idCol = (resource === 'flashcards' || resource === 'chunks') ? 'id' : 'id_key';
  const keys = Object.keys(req.body);
  const values = Object.values(req.body).map(val => 
    (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val
  );
  const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

  try {
    const query = `UPDATE ${resource} SET ${setClause} WHERE ${idCol} = $${values.length + 1} RETURNING *`;
    const result = await pool.query(query, [...values, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item updated', item: result.rows[0] });
  } catch (error) {
    console.error(`Error updating item in ${resource}:`, error);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT to replace all items (Bulk update)
app.put('/:resource', async (req, res) => {
  const { resource } = req.params;
  if (!resources.includes(resource)) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const items = req.body;
  const { chunk_id } = req.query; // Optional: filter by chunk_id for flashcards

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Body must be an array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    if (resource === 'flashcards' && chunk_id) {
      // Delete only cards for this chunk instead of truncating
      await client.query(`DELETE FROM flashcards WHERE chunk_id = $1`, [chunk_id]);
    } else {
      // For other resources or if no chunk_id provided, truncate as before
      // NOTE: For flashcards, this will wipe ALL cards across ALL chunks!
      await client.query(`TRUNCATE TABLE ${resource} RESTART IDENTITY CASCADE`);
    }

    for (const item of items) {
      const filteredItem = { ...item };
      delete filteredItem.id;
      delete filteredItem.id_key;
      
      // Ensure chunk_id is set if provided in query
      if (resource === 'flashcards' && chunk_id) {
        filteredItem.chunk_id = chunk_id;
      }

      const keys = Object.keys(filteredItem);
      const values = Object.values(filteredItem);
      const columns = keys.join(', ');
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      
      const query = `INSERT INTO ${resource} (${columns}) VALUES (${placeholders})`;
      await client.query(query, values);
    }

    await client.query('COMMIT');
    res.json({ message: 'Items updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error in bulk update for ${resource}:`, error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// DELETE an item by id
app.delete('/:resource/:id', async (req, res) => {
  const { resource, id } = req.params;
  if (!resources.includes(resource)) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const idCol = (resource === 'flashcards' || resource === 'chunks') ? 'id' : 'id_key';

  try {
    const result = await pool.query(`DELETE FROM ${resource} WHERE ${idCol} = $1 RETURNING *`, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted', item: result.rows[0] });
  } catch (error) {
    console.error(`Error deleting item in ${resource}:`, error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
