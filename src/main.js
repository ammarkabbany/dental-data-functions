import { Client, Databases, Query, Teams, Users } from 'node-appwrite';

// This Appwrite function will be executed every time your function is triggered
export default async ({ req, res, log, error }) => {
  // You can use the Appwrite SDK to interact with other services
  // For this example, we're using the Users service
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');
  const users = new Users(client);
  const databases = new Databases(client);
  const teams = new Teams(client);

  if (req.path === '/updatedocuments') {
    const { databaseid, collectionid } = req.headers;
    const { documents, data } = JSON.parse(req.body);
  
    // Validate payload
    if (!collectionid || !documents || !data) {
      log(databaseid, collectionid);
      return res.json({ message: 'Invalid payload' });
    }
    try {
      const promises = documents.map(async (documentId) => {
        const document = await databases.getDocument(databaseid, collectionid, documentId);
        const doctorId = document.doctorId;
        const teamId = document.teamId;
  
        // Update the document
        await databases.updateDocument(databaseid, collectionid, documentId, data);
  
        const newDue = data.due;
        const oldDue = _case.due || 0;
        // Update the doctor
        if (doctorId) {
          const doctorData = {
            due: Math.max((document.doctor.due || 0) - (data.due || 0), 0),
            // totalCases: Math.max(0, (document.doctor.totalCases || 0) - 1),
          };
          await databases.updateDocument(databaseid, DOCTORS_COLLECTION_ID, doctorId, doctorData);
        }
      });
  
      // Wait for all updates to complete
      await Promise.all(promises);
  
      return res.json({ success: true, message: "Documents updated successfully" });
    } catch (error) {
      console.error("Error updating documents:", error);
      return res.json({ success: false, message: error.message }, 500);
    }
  }
  
  if (req.path === '/deletedocuments') {
    const { databaseid, collectionid } = req.headers;
    const { documents } = JSON.parse(req.body);
  
    // Validate payload
    if (!collectionid || !documents) {
      log(databaseid, collectionid);
      return res.json({ message: 'Invalid payload' });
    }
    try {
      const promises = documents.map(async (documentId) => {
        const document = await databases.getDocument(databaseid, collectionid, documentId);
        const doctor = await databases.getDocument(databaseid, process.env.DOCTORS_COLLECTION_ID, document.doctorId)
  
        // Delete the document
        await databases.deleteDocument(databaseid, collectionid, documentId);
  
        // Update the doctor
        if (doctor) {
          const doctorData = {
            due: Math.max((doctor.due || 0) - (document.due || 0), 0),
            totalCases: Math.max(0, (doctor.totalCases || 0) - 1),
          };
          await databases.updateDocument(databaseid, process.env.DOCTORS_COLLECTION_ID, doctor.$id, doctorData);
        }
      });
  
      // Wait for all deletions to complete
      await Promise.all(promises);
  
      return res.json({ success: true, message: "Documents deleted successfully" });
    } catch (error) {
      return res.json({ success: false, message: error.message }, 500);
    }
  }
  

  if (req.path === "/user") {
    const { userId } = JSON.parse(req.body);
    if (!userId) {
      return res.json({ message: 'User ID is required' });
    }
    try {
      const user = await users.get(userId);
      const wantedUser = {
        $id: user.$id,
        name: user.name,
        email: user.email,
        emailVerification: user.emailVerification,
        labels: user.labels,
        prefs: user.prefs,
        status: user.status,
        $createdAt: user.$createdAt,
        $updatedAt: user.$updatedAt,
      }
      return res.json(wantedUser)
    } catch (err) {
      log.error(err);
      return res.text(err.message)
    }
  }

  if (req.path === '/users') {
    const { queries = [] } = req.body;
    try {
      const userList = await users.list(queries);
      const teamList = (await teams.list()).teams;
  
      // Map through users and resolve their teams and memberships
      const finalList = await Promise.all(userList.users.map(async (user) => {
        // Resolve team memberships for each user
        const resolvedMembership = await Promise.all(
          teamList.map(async (t) => {
            const memberships = (await teams.listMemberships(t.$id)).memberships;
            const membership = memberships.find((m) => m.userId === user.$id);
            if (membership) {
              const team = teamList.find((tt) => tt.$id === membership.teamId);
              return { team, membership };
            }
            return null; // Return null if no membership is found
          })
        );
  
        // Find the first non-null membership
        const result = resolvedMembership.find((res) => res !== null);
  
        const membership = result ? result.membership : undefined;
        const team = result ? result.team : undefined;
  
        return {
          ...user,
          password: null,
          team: team ? team : undefined,
          membership: membership ? membership : undefined,
          roles: membership ? membership.roles : undefined,
        };
      }));
  
      return res.json({ finalList, total: userList.total });
    } catch (e) {
      log(e);
      return res.text('An error occurred');
    }
  }
  

  if (req.path === '/total') {
    try {
      const cases = await databases.listDocuments(
        'mega_dental_data',
        '66dda08500057cc4e21c',
        [Query.limit(1), Query.select(['date'])]
      );
      const doctors = await databases.listDocuments(
        'mega_dental_data',
        '66dc203400027b5e3c73',
        [Query.limit(1), Query.select(['$id'])]
      );
      const materials = await databases.listDocuments(
        'mega_dental_data',
        '66dc297a002804d0dc8e',
        [Query.limit(1), Query.select(['$id'])]
      );
      const labs = (await teams.list()).total;
      return res.json({
        cases: cases.total,
        doctors: doctors.total,
        materials: materials.total,
        teams: labs,
      });
    } catch (e) {
      log(e);
      return res.text('');
    }
  }

  return res.text('');
};
