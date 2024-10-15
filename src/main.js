import { Client, Databases, Query, Users } from 'node-appwrite';

// This Appwrite function will be executed every time your function is triggered
export default async ({ req, res, log, error }) => {
  // You can use the Appwrite SDK to interact with other services
  // For this example, we're using the Users service
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');
  const users = new Users(client);
  const databases = new Databases(client)

  const auth_token = req.headers['Authorization'];
  const envAuthToken = process.env.APPWRITE_FUNCTION_AUTH_TOKEN

  try {
    const response = await users.list();
    // Log messages and errors to the Appwrite Console
    // These logs won't be seen by your end users
    log(`Total users: ${response.total}`);
    log(envAuthToken)
    log(auth_token)
  } catch(err) {
    error("Could not list users: " + err.message);
  }

  // The req object contains the request data
  if (req.path === "/ping") {
    // Use res object to respond with text(), json(), or binary()
    // Don't forget to return a response!
    return res.text("Pong");
  }

  if (req.path === "/total") {
    if (auth_token === envAuthToken) {
      const response = await databases.listDocuments("mega_dental_data", "66dda08500057cc4e21c", [Query.limit(1)]);
      return res.json({ cases: response.total });
    } else {
      return res.status(401).json({ error: "Invalid auth token", auth_token, envAuthToken });
    }
  }

  return res.json({
    motto: "Build like a team of hundreds_",
    learn: "https://appwrite.io/docs",
    connect: "https://appwrite.io/discord",
    getInspired: "https://builtwith.appwrite.io",
  });
};
