const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');

const nid = "N_1000";

app.use(express.json());

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Set up SQLite DB
const db = new sqlite3.Database('baycolors.db');

// Create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS bay_colors (
    group_id TEXT,
    bay_id INTEGER,
    color TEXT,
    PRIMARY KEY (group_id, bay_id)
  )
`);


// Optional: fallback to index.html for any unknown route
app.get('/', (req, res) => {
    
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// CORS for dev/testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Adjust in production
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// POST: Save bay color
app.post('/update-bay-color', (req, res) => {

    console.log(req.body); // Log the request body for debugging
     const item = req.body;
  const { group, id, color } = req.body;

  if (!group || id === undefined || !color) {
    return res.status(400).json({ success: false, message: "Missing group, id or color" });
  }

  const query = `
    INSERT INTO bay_colors (group_id, bay_id, color)
    VALUES (?, ?, ?)
    ON CONFLICT(group_id, bay_id)
    DO UPDATE SET color = excluded.color
  `;

  db.run(query, [group, id, color], function(err) {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    console.log(`💾 Saved: Group ${group} | Bay ${id} | Color ${color}`);
    res.json({ success: true, message: "Bay color saved" });
  });



  item.nid = nid;

  var jsonString = JSON.stringify(item);

  jsonString = "'" + jsonString + "'";
  console.log(jsonString);

  const scriptPath = path.join('/home/yan/sx126x_lorawan_hat_code/python/lora/examples/SX126x/', 'transmitter_set_color.py');

  // var l = item.color;
  // l = l.substring(l.indexOf("(")+1, l.lastIndexOf(")"))
  // Run the Python script with RGB values as arguments
  exec(`sudo python3 ${scriptPath} ${jsonString}`, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error: ${stderr}`);
      // return res.status(500).send('Error executing Python script');
    }

    // Send success response with script output
    console.log(`Script Output: ${stdout}`);
    // res.status(200).json({
    //   status: 'success',
    //   message: `Color RGB(${item.color}) saved successfully`,
    // });
  });



  
});

// Optional: View saved bay colors
app.get('/bay-colors', (req, res) => {
  db.all("SELECT * FROM bay_colors", [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
