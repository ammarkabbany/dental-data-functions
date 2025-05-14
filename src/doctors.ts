import { Client, Databases, ID, Models, Permission, Query, Role } from 'node-appwrite';

export default async ({ req, res, log, error }: any) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT!)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID!)
    .setKey(req.headers['x-appwrite-key'] ?? '');

  const databases = new Databases(client);
  const DB_ID = process.env.DATABASE_ID!;
  const COLLECTION_CASES = process.env.CASES_COLLECTION_ID!;
  const COLLECTION_DOCTORS = process.env.DOCTORS_COLLECTION_ID!;
  const COLLECTION_PAYMENTS = process.env.PAYMENTS_COLLECTION_ID!;

  interface Doctor extends Models.Document {
    name: string;
  }

  interface Case extends Models.Document {
    doctorId: string;
    due: number;
    invoice: boolean;
  }
  interface Payment extends Models.Document {
    doctorId: string;
    amount: number;
  }

  const { teamId } = req.query;
  if (!teamId) {
    return res.json({ success: false, message: 'Missing teamId' });
  }

  try {
    // Fetch all doctors in the team
    const doctors = await databases.listDocuments<Doctor>(DB_ID, COLLECTION_DOCTORS, [
      Query.equal('teamId', teamId),
      Query.limit(1000),
    ]);

    // Fetch all un-invoiced cases in the team
    const cases = await databases.listDocuments<Case>(DB_ID, COLLECTION_CASES, [
      Query.equal('teamId', teamId),
      Query.equal('invoice', false),
      // Query.equal('status', 'active'),
      Query.limit(10000),
    ]);

    // Fetch all payments in the team
    const payments = await databases.listDocuments<Payment>(DB_ID, COLLECTION_PAYMENTS, [
      Query.equal('teamId', teamId),
      Query.limit(10000),
    ]);

    const doctorDues: Record<string, { name: string; totalDue: number; caseIds: string[] }> = {};

    for (const doc of doctors.documents) {
      const doctorCases = cases.documents.filter((c) => c.doctorId === doc.$id);
      const doctorPayments = payments.documents.filter((p) => p.doctorId === doc.$id);
      const totalDue = doctorCases.reduce((acc, c) => acc + c.due, 0) - doctorPayments.reduce((acc, p) => acc + p.amount, 0);
      const caseIds = doctorCases.map((c) => c.$id);
      doctorDues[doc.$id] = {
        name: doc.name || 'Unnamed Doctor',
        totalDue,
        caseIds,
      };
    }

    return res.json({
      success: true,
      data: doctorDues,
    });
  } catch (err: any) {
    error(err.message);
    return res.json({ success: false, message: 'Server error' });
  }
};
