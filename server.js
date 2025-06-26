const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const path = require("path");
const { exec } = require("child_process");

const amqp = require("amqplib");

const amqpUrl = {
  hostname: "192.16.1.1",
  port: 5673,
  username: "iTarget",
  password: "lights.",
};

const QUEUE = "queue_itarget";
const EXCHANGE = "awg.real_time_events";
const ROUTING_KEY = "event.bay_status_update";

// Example routing keys: updates vs change
// StatusChangeRoutingKey": "event.bay_status_change"
//    "StatusUpdateRoutingKey": "event.bay_status_update"

const nid = "N_1000";

app.use(express.json());

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Set up SQLite DB
const db = new sqlite3.Database("baycolors.db");

// Create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS bay_colors (
    group_id TEXT,
    bay_number INTEGER,
    bay_id INTEGER,
    color TEXT,
    PRIMARY KEY (group_id, bay_id)
  )
`);

// Optional: fallback to index.html for any unknown route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// CORS for dev/testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Adjust in production
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// POST: Save bay color
app.post("/update-bay-color", (req, res) => {
  console.log(req.body); // Log the request body for debugging
  const item = req.body;
  const { group, bay_number, id, color } = req.body;

  if (!group || id === undefined || !color) {
    return res
      .status(400)
      .json({ success: false, message: "Missing group, id or color" });
  }

  const query = `
    INSERT INTO bay_colors (group_id, bay_number, bay_id, color)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(group_id, bay_id)
    DO UPDATE SET color = excluded.color
  `;

  db.run(query, [group, bay_number, id, color], function (err) {
    if (err) {
      console.error("DB error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    }

    console.log(
      `💾 Saved: Group ${group}| Bay number ${bay_number} | Bay ${id} | Color ${color}`
    );
    res.json({ success: true, message: "Bay color saved" });
  });

  item.nid = nid;

  var jsonString = JSON.stringify(item);

  jsonString = "'" + jsonString + "'";
  console.log(jsonString);

  const scriptPath = path.join(
    "/home/yan/sx126x_lorawan_hat_code/python/lora/examples/SX126x/",
    "transmitter_set_color.py"
  );

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
app.get("/bay-colors", (req, res) => {
  db.all("SELECT * FROM bay_colors", [], (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

async function connectRabbitMQ() {
  // RabbitMQ connection string

  try {
    // Connect to RabbitMQ
    const connection = await amqp.connect({
      protocol: "amqp",
      hostname: amqpUrl.hostname,
      port: amqpUrl.port,
      username: amqpUrl.username,
      password: amqpUrl.password,
      vhost: "/",
      servername: false,
    });
    const channel = await connection.createChannel();

    // Declare the exchange as a topic
    await channel.assertExchange(EXCHANGE, "topic", { durable: false });

    // Create a queue that will receive messages
    const { queue } = await channel.assertQueue(QUEUE, { durable: false });

    // Bind the queue to the exchange with a routing key
    await channel.bindQueue(queue, EXCHANGE, ROUTING_KEY);

    // Consume messages from the queue
    console.log(`Waiting for messages in ${queue}.`);

    channel.consume(
      queue,
      (msg) => {
        if (msg) {
          // Convert message to string
          const message = msg.content.toString();
          let json_msg = [];
          try {
            json_msg = JSON.parse(message);
          } catch (error) {
            console.error("Invalid JSON format:", error);
            return;
          } 

          // Process the received message
          processMessage(json_msg.BayStatusList);
        }
      },
      { noAck: true }
    );
  } catch (error) {
    console.error("Error:", error);

    setTimeout(connectRabbitMQ, 2000);
  }
}

function processMessage(message) {
  let js_message;
  //  console.log('Processing message:', message);

  console.log("Parsed message:", message);
  const bay_info = [];
  message.map((item, i) => {
    const bay_item = {
      bay_number: item.Number,
      state: item.State,
    };

    bay_info.push(bay_item);
  });

  // Emit to frontend
  io.emit("bay-status-update", bay_info); // Customize event name and payload as needed

  // Check if distance is close to the target
}

// Run RabbitMQ connection
// connectRabbitMQ();

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
