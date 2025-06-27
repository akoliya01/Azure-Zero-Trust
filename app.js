require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const assessmentRoute = require('./routes/assessment');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
// Add this line to serve the reports folder:
app.use('/reports', express.static(path.join(__dirname, 'reports')));
app.use('/assessment', assessmentRoute);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});