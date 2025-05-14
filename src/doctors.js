import { Client, Databases, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');

  const databases = new Databases(client);
  const DB_ID = process.env.DATABASE_ID;
  const COLLECTION_CASES = process.env.CASES_COLLECTION_ID;
  const COLLECTION_DOCTORS = process.env.DOCTORS_COLLECTION_ID;
  const COLLECTION_PAYMENTS = process.env.PAYMENTS_COLLECTION_ID;

  // interface Doctor extends Models.Document {
  //   name: string;
  // }

  // interface Case extends Models.Document {
  //   doctorId: string;
  //   due: number;
  //   invoice: boolean;
  // }
  // interface Payment extends Models.Document {
  //   doctorId: string;
  //   amount: number;
  // }

  const { teamId } = req.query;
  if (!teamId) {
    return res.json({ success: false, message: 'Missing teamId' });
  }

  try {
    // Fetch all doctors in the team
    const doctors = await databases.listDocuments(DB_ID, COLLECTION_DOCTORS, [
      Query.equal('teamId', teamId),
      Query.limit(1000),
    ]);

    // Fetch all un-invoiced cases in the team
    const cases = await databases.listDocuments(DB_ID, COLLECTION_CASES, [
      Query.equal('teamId', teamId),
      Query.equal('invoice', false),
      // Query.equal('status', 'active'),
      Query.limit(10000),
    ]);

    // Record<string, { name: string; totalDue: number; caseIds: string[] }>
    const doctorDues = [];

    for (const doc of doctors.documents) {
      const payments = await databases.listDocuments(DB_ID, COLLECTION_PAYMENTS, [
        Query.equal('doctorId', doc.$id),
        Query.limit(10000),
      ]);
      const doctorCases = cases.documents.filter((c) => c.doctorId === doc.$id);
      const doctorPayments = payments.documents.filter((p) => p.doctorId === doc.$id);
      const totalDue = doctorCases.reduce((acc, c) => acc + c.due, 0) - doctorPayments.reduce((acc, p) => acc + p.amount, 0);
      const totalCases = doctorCases.length;
      doctorDues.push({
        $id: doc.$id,
        name: doc.name,
        due: totalDue,
        totalCases: totalCases,
      });
    }

    return res.json({
      success: true,
      data: doctorDues,
    });
  } catch (err) {
    error(err.message);
    return res.json({ success: false, message: 'Server error' });
  }
};
