const http = require('http');

const HOST = 'localhost';
const PORT = 3000;

const request = (method, path, data) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
};

async function testResource(resource, postData, putData) {
  console.log(`\n========================================`);
  console.log(`Testing Resource: ${resource}`);
  console.log(`========================================`);

  // 1. GET ALL
  console.log('1. GET /: Fetching all...');
  const res1 = await request('GET', `/${resource}`);
  console.log(`Status: ${res1.status}`);

  // 2. POST
  console.log('\n2. POST /: Creating new item...');
  const res2 = await request('POST', `/${resource}`, postData);
  console.log(`Status: ${res2.status}`);
  console.log('Response:', res2.data);
  const newItemId = res2.data ? res2.data.id : null;

  if (!newItemId) {
    console.error('Failed to get ID from POST response');
    return;
  }

  // 3. GET ADDED
  console.log(`\n3. GET /:resource/:id: Verifying addition of ID ${newItemId}...`);
  const res3 = await request('GET', `/${resource}/${newItemId}`);
  console.log(`Status: ${res3.status}`);
  console.log('Item:', res3.data);

  // 4. PUT
  console.log(`\n4. PUT /:resource/:id: Updating item ${newItemId}...`);
  const res4 = await request('PUT', `/${resource}/${newItemId}`, putData);
  console.log(`Status: ${res4.status}`);
  console.log('Response:', res4.data);

  // 5. DELETE
  console.log(`\n5. DELETE /:resource/:id: Deleting item ${newItemId}...`);
  const res5 = await request('DELETE', `/${resource}/${newItemId}`);
  console.log(`Status: ${res5.status}`);
  console.log('Response:', res5.data);

  // 6. GET FINAL
  console.log('\n6. GET /: Final check...');
  const res6 = await request('GET', `/${resource}`);
  console.log(`Count after delete: ${Array.isArray(res6.data) ? res6.data.length : 'N/A'}`);
  console.log(`========================================`);
}

async function runTests() {
  try {
    // Test Flashcards
    await testResource('flashcards', 
      { question: 'Test Question', answer: 'Test Answer' },
      { question: 'Updated Question', answer: 'Updated Answer' }
    );

    // Test Reading Quizzes with EMPTY questions
    await testResource('reading_quizzes',
      { 
        id: 'test-node-123', 
        title: 'Node Test Quiz', 
        passage: 'Test Passage', 
        questions: [] 
      },
      { 
        title: 'Updated Node Quiz'
      }
    );

    // Test Reading Quizzes with NESTED questions
    await testResource('reading_quizzes',
      { 
        id: 'test-node-nested', 
        title: 'Nested Test Quiz', 
        passage: 'Test Passage', 
        questions: [{ id: 'q1', questionText: 'Q1', choices: ['A', 'B'], correctIndex: 0 }] 
      },
      { 
        title: 'Updated Nested Quiz'
      }
    );

    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Test execution failed:', error);
  }
}

runTests();
