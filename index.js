require('dotenv').config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const formData = require("form-data");
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

// Mailogun email
const mg = mailgun.client({
    username: "api",
    key: process.env.MAIL_GUN_API_KEY || "API_KEY",
});



// middlware 
app.use(cors());
app.use(express.json());
app.use(express.static("public"));


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zflfj9t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db("bistroDb").collection("users");
        const menuCollection = client.db("bistroDb").collection("menu");
        const reviewCollection = client.db("bistroDb").collection("reviews");
        const cartCollection = client.db("bistroDb").collection("carts");
        const paymentCollection = client.db("bistroDb").collection("payments");

        // jwt related api 
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCES_TOKEN_SECRET, { expiresIn: "1h" });
            res.send({ token });
        })

        // Verify token 
        const verifyToken = (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: "Unauthorized access - No token provided" });
            }

            const token = req.headers.authorization.split(" ")[1];
            // console.log("token", token);
            if (!token) {
                return res.status(401).send({ message: "Forbidden access" });
            }

            jwt.verify(token, process.env.ACCES_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "Forbidden access" });
                }
                req.decoded = decoded;
                next();
            })
            // next;
        }

        // Verify admin after verify token
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user.role === "admin";
            if (!isAdmin) {
                return res.status(403).response({ message: "forbidden access" });
            }
            next();
        }

        //Users related api
        app.get('/users', verifyToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(401).send({ message: "unauthorized access" });
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            // console.log('admin ', email, user);
            let admin = false;
            if (user) {
                admin = user?.role === "admin";
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;

            // Check user exist or not
            // This doing many way, 1. Unique email, 2.Upsert, 3. Simple Check (like this)
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "User already exist", insertId: null });
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // Menu related api
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        })

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;

            // let query = { _id: new ObjectId(id) };
            let query = { _id: id }; // match string ids
            query = {
                $or: [
                    { _id: id },
                    { _id: new ObjectId(id) }
                ]
            };

            const result = await menuCollection.findOne(query);
            res.send(result);
        })

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menuItem = req.body;
            const result = await menuCollection.insertOne(menuItem);
            res.send(result);
        })

        app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const item = req.body;

            // id have string and object id formate, so make string into object id
            let filter = { _id: id }; // match string ids
            filter = { $or: [{ _id: id }, { _id: new ObjectId(id) }] };

            const upsertedId = true;
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc, upsertedId);
            res.send(result);
        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        // Reviews related api
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })

        // Cart related api
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        // Payment Intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"]
            })

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.decoded.email !== req.params.email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            // console.log("payment info", payment, paymentResult);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartCollection.deleteMany(query);

            // Mailgun email 
            mg.messages.create(process.env.MAIL_SENDING_DOMAIN, {
                from: `Mailgun Sandbox <postmaster@${process.env.MAIL_SENDING_DOMAIN}>`,
                to: ["Magee Haney123 <xaha@mailinator.com>"],
                subject: "Hello Magee Haney123",
                text: "Congratulations Magee Haney123, you just sent an email with Mailgun! You are truly awesome!",
            });

            res.send({ paymentResult, deleteResult });
        })

        // States
        app.get('/admin-states', verifyToken, verifyAdmin, async (req, res) => {
            const userCount = await userCollection.estimatedDocumentCount();
            const menuItemCount = await menuCollection.estimatedDocumentCount();
            const orderCount = await paymentCollection.estimatedDocumentCount();
            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: "$price"
                        }
                    }
                }
            ]).toArray();
            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                userCount,
                menuItemCount,
                orderCount,
                revenue
            })
        })

        app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: "$menuItemIds"
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: "$menuItems"
                },
                {
                    $group: {
                        _id: "$menuItems.category",
                        quantity: { $sum: 1 },
                        revenue: { $sum: "$menuItems.price" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: "$_id",
                        quantity: "$quantity",
                        revenue: "$revenue"
                    }
                }
            ]).toArray();

            res.send(result);
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("Bistro Boss Restaurant Server is Running....");
})

app.listen(port, () => {
    console.log(`Server running on ${port}`);
})

module.exports = app;