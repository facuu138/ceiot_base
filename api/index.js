// Initialize API
console.log("Inicializando API...")
const express = require("express"); // Import express framework
const bodyParser = require("body-parser"); // Import body-parser
const { MongoClient } = require("mongodb"); // import mongodb
const PgMem = require("pg-mem"); // import postgreSQL

const db = PgMem.newDb(); // Create a new instance of the in-memory db

const render = require("./render.js");
// Measurements database setup and access

let database = null; // Initialize the variable
const collectionName = "measurements"; // Initialize collection name

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
    const timestamp = new Date(); // Add timestamp
    const measures = { id: message.id, t: message.t, h: message.h, timestamp: timestamp}; // Se agregan los valores tal cual del mensaje + el timestamp
    // Function that inserts a Measurement into a specified collection
    const { insertedId } = await database.collection(collectionName).insertOne(measures); // cambiamos message por measures para evaluar timestamp
    console.log(`Medida perteneciente a device ${message.id} insertada`)
    return insertedId;
}

async function getMeasurements() {
    // Function to retrieve all measuremente from a specified collection
    return await database.collection(collectionName).find({}).toArray();
}

// API Server

const app = express(); // Creates instance of the express application

app.use(bodyParser.urlencoded({ extended: false })); // Sets the application to use body-parser for parsing the URL-encoded request bodies

app.use(express.static('spa/static'));

const PORT = 8080; // Set port number where server will listen on

app.post('/measurement', function (req, res) {
    // When a POST request is made to the '/measurement' endpoint, the function is executed. 
    // The function calls the insertMeasurement function to insert the data into a collection
    console.log('POST request a /measurement')

    // Check if the request body contains id and either t or h
    if (!req.body.id || (!req.body.t && !req.body.h)) {
        let missingFields = [];
        if (!req.body.id) missingFields.push('id');
        if (!req.body.t && !req.body.h) missingFields.push('t or h');
        console.log(`Bad Request: Missing required fields - ${missingFields.join(', ')}`)
        return res.status(400).send(`Bad Request: Missing required fields - ${missingFields.join(', ')}`);
    }

    // Check if t and h are numbers
    let temperature, humidity;
    if (req.body.t) {
        temperature = parseFloat(req.body.t);
        if (isNaN(temperature)) {
            console.log('Bad Request: t must be a number')
            return res.status(400).send('Bad Request: temperature must be a number');
        }
    }
    if (req.body.h) {
        humidity = parseFloat(req.body.h);
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
    const query = "SELECT * FROM devices WHERE device_id = '" + req.body.id + "'";
    const queryResult = db.public.query(query);

    if (queryResult.rows.length === 0) {
        console.log(`Device with ID ${req.body.id} not found`)
        return res.status(404).send(`Device with ID ${req.body.id} not found`);
    } else {
        // Device exists, proceed with inserting measurement
        console.log("device id: " + req.body.id + "\ntemperature: " + req.body.t + "\nhumidity: " + req.body.h);
        insertMeasurement({ id: req.body.id, t: req.body.t, h: req.body.h });
        return res.send(`Received measurement for device ${req.body.id}`);
    }
});

app.post('/device', function (req, res) {
    console.log('POST request at /device');

    const query = "SELECT * FROM devices WHERE device_id = '" + req.body.id + "'";
    const queryResult = db.public.query(query);

    const id = req.body.id
    const name = req.body.n
    const key = req.body.k

    if (queryResult.rows.length === 0) {
        // Validation checks
        if (!isNumber(id) || id > 99999 || typeof name !== 'string' || name.length > 20 || !isNumber(key) || key > 9999999) {
            return res.status(400).send('Invalid device data');
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
            "</td><td>" + device.name + "</td><td>" + device.key + "</td><td>" + device.created_date + "</td></tr>"; // Se agrega el timestamp en la tabla html
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
        "</html>"); // Se agrega el timestamp al encabezado de la tabla html
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
        "created_date : {{ created_date }}" + //agregamos timestamp
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
    var black = "\33[34m"; // se agrega el color negro para timestamp
    var reset = "\33[0m";
    var template = "Device name " + red + "   {{name}}" + reset + "\n" +
        "       id   " + green + "       {{ id }} " + reset + "\n" +
        "       key  " + blue + "  {{ key }}" + reset + "\n" +
        "       created_date   " + black + "   {{ created_date }}" + reset + "\n"; //agregamos timestamp al traer un id en especifico y se agrega el color negro
    var device = db.public.many("SELECT * FROM devices WHERE device_id = '" + req.params.id + "'");
    console.log(device);
    res.send(render(template, { id: device[0].device_id, key: device[0].key, name: device[0].name, created_date: device[0].created_date })); //agregamos timestamp al traer un id en especifico
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
