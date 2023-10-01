// Initialize API
console.log("Initialize API...")
const express = require("express");
const bodyParser = require("body-parser"); 
const { MongoClient } = require("mongodb");
const PgMem = require("pg-mem");

const db = PgMem.newDb(); // Create a new instance of the in-memory db

const render = require("./render.js"); 

// Measurements database setup and access
let database = null;
const collectionName = "measurements";

async function startDatabase() {
    // Set up a connection to MongoDB
    const uri = "mongodb://localhost:27017/?maxPoolSize=20&w=majority";
    const connection = await MongoClient.connect(uri, { useNewUrlParser: true });
    database = connection.db();
    console.log("Conexion con MongoDB establecida")
}

async function getDatabase() {
    // This function ensures there's a valid database connection before returning it
    if (!database) await startDatabase();
    return database;
    console.log("Conexion con la base de datos establecida")
} 

async function insertMeasurement(message) {
    // Function that inserts a Measurement into a specified collection
    const timestamp = new Date(); // Add timestamp
    const measures = { id: message.id, t: message.t, h: message.h, timestamp: timestamp}; // Add all values to the database
    const { insertedId } = await database.collection(collectionName).insertOne(measures);
    console.log(`Medida perteneciente a device ${message.id} insertada`)
    return insertedId;
}

async function getMeasurements() {
    // Function to retrieve all measuremente from a specified collection
    return await database.collection(collectionName).find({}).toArray();
}

// API Server
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.static('spa/static'));

const PORT = 8080;

// Helper function to remove all single quotes
function sanitizeInput(input) {
    return input.replace(/'/g, '');
}

app.post('/measurement', function (req, res) {
    // When a POST request is made to the '/measurement' endpoint, the function is executed. 
    // The function calls the insertMeasurement function to insert the data into a collection
    console.log('POST request a /measurement')

    const deviceId = sanitizeInput(req.body.id);
    const temp = sanitizeInput(req.body.t);
    const hum = sanitizeInput(req.body.h);

    // Check if the request body contains id and either t or h
    if (!deviceId || (!temp && !hum)) {
        let missingFields = [];
        if (!deviceId) missingFields.push('id');
        if (!temp && !hum) missingFields.push('t or h');
        console.log(`Bad Request: Missing required fields - ${missingFields.join(', ')}`)
        return res.status(400).send(`Bad Request: Missing required fields - ${missingFields.join(', ')}`);
    }

    // Check if t and h are numbers
    let temperature, humidity;
    if (temp) {
        temperature = parseFloat(temp);
        if (isNaN(temperature)) {
            console.log('Bad Request: t must be a number')
            return res.status(400).send('Bad Request: temperature must be a number');
        }
    }
    if (hum) {
        humidity = parseFloat(hum);
        if (isNaN(humidity)) {
            console.log('Bad Request: h must be a number')
            return res.status(400).send('Bad Request: humidity must be a number');
        }
    }

    // Check if humidity is non-negative
    if (humidity !== undefined && humidity < 0) {
        console.log('Bad Request: Humidity cannot be negative')
        return res.status(400).send('Bad Request: humidity cannot be negative');
    }

    // Check if the device exists in the database (in-memory simulation)
    const query = "SELECT * FROM devices WHERE device_id = '"+deviceId+"'";
    const queryResult = db.public.query(query);

    if (queryResult.rows.length === 0) {
        console.log(`Device with ID ${deviceId} not found`)
        return res.status(404).send(`Device with ID ${deviceId} not found`);
    } else {
        // Device exists, proceed with inserting measurement
        console.log("device id: " + deviceId + "\ntemperature: " + temp + "\nhumidity: " + hum);
        insertMeasurement({ id: deviceId, t: temp, h: hum });
        return res.send(`Received measurement for device ${deviceId}`);
    }
});

app.post('/device', function (req, res) {
    console.log('POST request at /device');

    const id = sanitizeInput(req.body.id);
    const name = sanitizeInput(req.body.n);
    const key = sanitizeInput(req.body.k);

    const queryDevices = "SELECT device_id FROM devices WHERE device_id = '" + req.body.id + "'";
    const queryResult = db.public.query(queryDevices);

    const queryKeys = "SELECT key FROM devices WHERE key = '" + req.body.k + "'";

    if (queryResult.rows.length === 0) {
        // Validation checks
        if (!isNumber(id)) {
            console.log('ID must be a number');
            return res.status(400).send('ID must be a number');
        }
        
        if (id > 99999) {
            console.log('ID must be less than or equal to 99999');
            return res.status(400).send('ID must be less than or equal to 99999');
        }
        
        if (name.length < 5 || name.length > 20) {
            console.log('Name length must be between 5 and 20 characters');
            return res.status(400).send('Name length must be between 5 and 20 characters');
        }
        
        if (!isNumber(key)) {
            console.log('Key must be a number');
            return res.status(400).send('Key must be a number');
        }
        
        if (key < 111111 || key > 9999999) {
            console.log('Key must be a 6 or 7 digit number');
            return res.status(400).send('Key must be a 6 or 7 digit number');
        }

        if (db.public.query(queryKeys).rows.length > 0) {
            console.log('Key already exists');
            return res.status(400).send('Key already exists');
        }
        
        const timestamp = new Date();
        console.log("device id: " + id + "\nname: " + name + "\nkey: " + key);

        db.public.none("INSERT INTO devices VALUES ('" + id + "', '" + name + "', '" + key + "','" + timestamp + "')");

        res.send("Received new device");
    } else {
        // Device exists
        console.log(`Device with ID ${id} already exists`)
        return res.status(404).send(`Device with ID ${id} already exists`);
    }   
});

// Helper function to check if a value is a number
function isNumber(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
}

app.get('/web/device', function (req, res) {
    // Queries a database for a list of devices and generates an HTML response to display them in a table format.
    console.log(`GET request a /web/device para ${req.params.id}`)
    var devices = db.public.many("SELECT * FROM devices").map(function (device) {
        console.log(device);
        return '<tr><td><a href=/web/device/' + device.device_id + '>' + device.device_id + "</a>" +
            "</td><td>" + device.name + "</td><td>" + device.key + "</td><td>" + device.created_date + "</td></tr>";
    }
    );
    res.send("<html>" +
        "<head><title>Sensores</title></head>" +
        "<body>" +
        "<table border=\"1\">" +
        "<tr><th>id</th><th>name</th><th>key</th><th>created_date</th></tr>" +
        devices +
        "</table>" +
        "</body>" +
        "</html>");
});

app.get('/web/device/:id', function (req, res) {
    // Queries the database for a specific device based on the ID provided in the URL and generates an HTML response to display its details.
    console.log(`GET request a /web/device/:id para ${req.params.id}`)
    var template = "<html>" +
        "<head><title>Sensor {{name}}</title></head>" +
        "<body>" +
        "<h1>{{ name }}</h1>" +
        "id  : {{ id }}<br/>" +
        "Key : {{ key }}<br/>" +
        "created_date : {{ created_date }}" +
        "</body>" +
        "</html>";


    var device = db.public.many("SELECT * FROM devices WHERE device_id = '" + req.params.id + "'");
    console.log(device);
    res.send(render(template, { id: device[0].device_id, key: device[0].key, name: device[0].name, created_date: device[0].created_date }));
});


app.get('/term/device/:id', function (req, res) {
    // Queries the database for a specific device based on the ID provided in the URL, but it generates a response suitable for terminal output.
    console.log('GET request a /term/device/:id')
    var red = "\33[31m";
    var green = "\33[32m";
    var blue = "\33[33m";
    var black = "\33[34m";
    var reset = "\33[0m";
    var template = "Device name " + red + "   {{name}}" + reset + "\n" +
        "       id   " + green + "       {{ id }} " + reset + "\n" +
        "       key  " + blue + "  {{ key }}" + reset + "\n" +
        "       created_date   " + black + "   {{ created_date }}" + reset + "\n";
    var device = db.public.many("SELECT * FROM devices WHERE device_id = '" + req.params.id + "'");
    console.log(device);
    res.send(render(template, { id: device[0].device_id, key: device[0].key, name: device[0].name, created_date: device[0].created_date })); 
});

app.get('/measurement', async (req, res) => {
    res.send(await getMeasurements());
});

app.get('/device', function (req, res) {
    res.send(db.public.many("SELECT * FROM devices"));
});

startDatabase().then(async () => {

    const addAdminEndpoint = require("./admin.js");
    addAdminEndpoint(app, render);

    await insertMeasurement({ id: '00', t: '18', h: '78' });
    await insertMeasurement({ id: '00', t: '19', h: '77' });
    await insertMeasurement({ id: '00', t: '17', h: '77' });
    await insertMeasurement({ id: '01', t: '17', h: '77' });
    console.log("Coleccion 'measurements' en MongoDB creada");

    db.public.none("CREATE TABLE devices (device_id VARCHAR, name VARCHAR, key VARCHAR, created_date TIMESTAMP)");
    db.public.none("INSERT INTO devices VALUES ('00', 'Fake Device 00', '123456', CURRENT_TIMESTAMP)");
    db.public.none("INSERT INTO devices VALUES ('01', 'Fake Device 01', '234567', CURRENT_TIMESTAMP)");
    db.public.none("CREATE TABLE users (user_id VARCHAR, name VARCHAR, key VARCHAR)");
    db.public.none("INSERT INTO users VALUES ('1','Ana','admin123')");
    db.public.none("INSERT INTO users VALUES ('2','Beto','user123')");

    console.log("Tabla de SQL 'devices' creada");

    app.listen(PORT, () => {
        console.log(`Listening at ${PORT}`);
    });
});
