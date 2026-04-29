const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const config = {
  user: 'ez',
  host: 'localhost',
  database: 'ezdb',
  password: 'postgres', // 確認できたパスワード
  port: 5432,
};

const jsonFiles = [
  { file: 'flashcards.json', table: 'flashcards' },
  { file: 'fill_in_the_blank.json', table: 'fill_in_the_blank' },
  { file: 'reading_quizzes.json', table: 'reading_quizzes' }
];

async function migrate() {
  const client = new Client(config);
  await client.connect();

  try {
    for (const item of jsonFiles) {
      const filePath = path.join(__dirname, item.file);
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(data)) {
        console.warn(`Data in ${item.file} is not an array`);
        continue;
      }

      console.log(`Migrating ${item.file} to table ${item.table}...`);

      // Drop tables if exist and recreate
      if (item.table === 'flashcards') {
        await client.query(`DROP TABLE IF EXISTS flashcards`);
        await client.query(`DROP TABLE IF EXISTS chunks CASCADE`); // Cascade to drop foreign keys
        
        console.log('Creating chunks table...');
        await client.query(`
          CREATE TABLE chunks (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL
          )
        `);

        console.log('Creating flashcards table with chunk_id...');
        await client.query(`
          CREATE TABLE flashcards (
            id SERIAL PRIMARY KEY,
            chunk_id INT REFERENCES chunks(id) ON DELETE CASCADE,
            question TEXT,
            answer TEXT
          )
        `);

        // Insert chunks
        const chunk1 = await client.query('INSERT INTO chunks (name) VALUES ($1) RETURNING id', ['Basic Words']);
        const chunk2 = await client.query('INSERT INTO chunks (name) VALUES ($1) RETURNING id', ['Fruits']);
        const chunk3 = await client.query('INSERT INTO chunks (name) VALUES ($1) RETURNING id', ['Animals']);
        
        const id1 = chunk1.rows[0].id;
        const id2 = chunk2.rows[0].id;
        const id3 = chunk3.rows[0].id;

        // Populate chunk 1 (from flashcards.json)
        for (const row of data) {
          await client.query('INSERT INTO flashcards (chunk_id, question, answer) VALUES ($1, $2, $3)', [id1, row.question, row.answer]);
        }

        // Populate chunk 2 (Fruits)
        const fruits = [
          { q: 'Apple', a: 'りんご' },
          { q: 'Banana', a: 'バナナ' },
          { q: 'Grape', a: 'ぶどう' }
        ];
        for (const f of fruits) {
          await client.query('INSERT INTO flashcards (chunk_id, question, answer) VALUES ($1, $2, $3)', [id2, f.q, f.a]);
        }

        // Populate chunk 3 (Animals)
        const animals = [
          { q: 'Dog', a: 'いぬ' },
          { q: 'Cat', a: 'ねこ' },
          { q: 'Elephant', a: 'ぞう' }
        ];
        for (const an of animals) {
          await client.query('INSERT INTO flashcards (chunk_id, question, answer) VALUES ($1, $2, $3)', [id3, an.q, an.a]);
        }
      } else if (item.table === 'fill_in_the_blank') {
        await client.query(`DROP TABLE IF EXISTS fill_in_the_blank`);
        await client.query(`
          CREATE TABLE fill_in_the_blank (
            id_key SERIAL PRIMARY KEY,
            id TEXT,
            question TEXT,
            answer TEXT
          )
        `);
        for (const row of data) {
          await client.query('INSERT INTO fill_in_the_blank (id, question, answer) VALUES ($1, $2, $3)', [row.id, row.question, row.answer]);
        }
      } else if (item.table === 'reading_quizzes') {
        await client.query(`DROP TABLE IF EXISTS reading_quizzes`);
        await client.query(`
          CREATE TABLE reading_quizzes (
            id_key SERIAL PRIMARY KEY,
            id TEXT,
            title TEXT,
            passage TEXT,
            questions JSONB
          )
        `);
        for (const row of data) {
          await client.query('INSERT INTO reading_quizzes (id, title, passage, questions) VALUES ($1, $2, $3, $4)', [row.id, row.title, row.passage, JSON.stringify(row.questions)]);
        }
      }
    }
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
