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

  const { teamId } = req.query;
  // if (!teamId) {
  //   return res.json({ success: false, message: 'Missing teamId' });
  // }

  if (req.path === '/all') {
    log('Updating all doctors');
    const doctors = await databases.listDocuments(DB_ID, COLLECTION_DOCTORS, [
      Query.limit(1000),
    ]);
    for (const doc of doctors.documents) {
      const cases = await databases.listDocuments(DB_ID, COLLECTION_CASES, [
        Query.equal('doctorId', doc.$id),
        Query.limit(10000),
      ]);
      const payments = await databases.listDocuments(
        DB_ID,
        COLLECTION_PAYMENTS,
        [Query.equal('doctorId', doc.$id), Query.limit(10000)]
      );
      const casesTotal = cases.documents.reduce(
        (acc, c) => acc + (c.due || 0),
        0
      );
      const paymentsTotal = payments.documents.reduce(
        (acc, p) => acc + (p.amount || 0),
        0
      );
      const totalDue = Math.max(0, casesTotal - paymentsTotal);
      const totalCases = cases.documents.length;
      // const unpaidCases = cases.documents.filter((c) =>!c.invoice).length;
      // const paidCases = cases.documents.filter((c) => c.invoice).length;
      await databases.updateDocument(DB_ID, COLLECTION_DOCTORS, doc.$id, {
        totalCases: totalCases,
        // unpaidCases: unpaidCases,
        // paidCases: paidCases,
        due: totalDue || 0,
      });
    }
    return res.json({ success: true, message: 'All doctors updated' });
  }

  // If the event is update, body = updated case
  // If the event is create, body = new case

  log(JSON.stringify({headers: req.headers, body: req.body, query: req.query}))

  // When new case is created:
  if (
    req.headers['x-appwrite-event'] &&
    req.headers['x-appwrite-event'].includes(COLLECTION_CASES) &&
    req.headers['x-appwrite-event'].endsWith('create')
  ) {
    const case_ = req.body;
    log('Case creation event received:', { caseId: case_.$id, doctorId: case_.doctorId });

    // Get initial doctor state
    const doctor = await databases.getDocument(DB_ID, COLLECTION_DOCTORS, case_.doctorId);
    log('Initial doctor state:', { doctorId: doctor.$id, due: doctor.due, totalCases: doctor.totalCases });

    const doctorDue = doctor.due || 0
    const totalCases = doctor.totalCases || 0

    // Log the update we're about to make
    const updateData = {
      due: Math.max(doctorDue + case_.due, 0),
      totalCases: totalCases + 1,
    };
    log('Updating doctor with:', updateData);

    await databases.updateDocument(DB_ID, COLLECTION_DOCTORS, doctor.$id, updateData);

    // Verify the update
    const updatedDoctor = await databases.getDocument(DB_ID, COLLECTION_DOCTORS, doctor.$id);
    log('Doctor state after update:', { doctorId: doctor.$id, due: updatedDoctor.due, totalCases: updatedDoctor.totalCases });
    log('Before update:', {
      doctorId: doctor.$id,
      currentTotalCases: totalCases,
      newTotalCases: totalCases + 1,
      currentDue: doctorDue,
      newDue: Math.max(doctorDue + case_.due, 0),
    });
    return res.json({ success: true, message: 'Doctor updated' });
  }
  // When case is updated:
  if (req.path === "/update") {
    const { caseId, doctorId, oldDue, newDue } = JSON.parse(req.body)

    log('Case update event received:', { caseId, doctorId, oldDue, newDue });


    // Get initial doctor state
    const doctor = await databases.getDocument(DB_ID, COLLECTION_DOCTORS, doctorId);
    log('Initial doctor state:', { doctorId: doctor.$id, due: doctor.due });

    const doctorDue = doctor.due || 0

    let result = 0;
    if (newDue < oldDue) {
      result = -(oldDue - newDue);
    } else if (newDue > oldDue) {
      result = newDue - oldDue;
    }

    // Log the update we're about to make
    const updateData = {
      due: Math.max(doctorDue + result, 0),
    };
    log('Updating doctor with:', updateData);

    await databases.updateDocument(DB_ID, COLLECTION_DOCTORS, doctor.$id, updateData);

    // Verify the update
    const updatedDoctor = await databases.getDocument(DB_ID, COLLECTION_DOCTORS, doctor.$id);
    log('Doctor state after update:', { doctorId: doctor.$id, due: updatedDoctor.due });
    log('Before update:', {
      doctorId: doctor.$id,
      currentDue: doctorDue,
      newDue: Math.max(doctorDue + result, 0),
    });
    return res.json({ success: true, message: 'Doctor updated' });
  }
  // When new payment is created:
  if (
    req.headers.get('x-appwrite-event').includes(COLLECTION_PAYMENTS) &&
    req.headers.get('x-appwrite-event').endsWith('create')
  ) {
    const payment = JSON.parse(req.body);
    // TODO: update the doctor's due
    const doctor = await databases.getDocument(
      DB_ID,
      COLLECTION_DOCTORS,
      payment.doctorId
    );
    const doctorDue = Math.max(doctor.due || 0 - payment.amount, 0);
    await databases.updateDocument(DB_ID, COLLECTION_DOCTORS, doctor.$id, {
      due: doctorDue || 0,
    });
    return res.json({ success: true, message: 'Doctor updated' });
  }

  try {
    // Fetch all doctors in the team
    const doctors = await databases.listDocuments(DB_ID, COLLECTION_DOCTORS, [
      Query.equal('teamId', teamId),
      Query.select(['$id', 'name', 'teamId']),
      Query.limit(1000),
    ]);

    const cases = await databases.listDocuments(DB_ID, COLLECTION_CASES, [
      Query.equal('teamId', teamId),
      // Query.equal('doctorId', doc.$id),
      Query.select(['doctorId', 'due', 'invoice', 'teamId']),
      // Query.equal('status', 'active'),
      Query.limit(10000),
    ]);

    // Record<string, { name: string; totalDue: number; caseIds: string[] }>
    const doctorDues = [];

    for (const doc of doctors.documents) {
      // const payments = await databases.listDocuments(
      //   DB_ID,
      //   COLLECTION_PAYMENTS,
      //   [Query.equal('doctorId', doc.$id), Query.limit(10000), Query.select(['amount', 'doctorId'])],
      // );
      const doctorCases = cases.documents.filter((c) => c.doctorId === doc.$id);
      const unpaidCases = doctorCases.filter((c) => !c.invoice);
      const paidCases = doctorCases.filter((c) => c.invoice);
      // const doctorPayments = payments.documents.filter(
      //   (p) => p.doctorId === doc.$id
      // );
      // const totalDue =
      //   cases.documents.reduce((acc, c) => acc + c.due, 0) -
      //   doctorPayments.reduce((acc, p) => acc + p.amount, 0);
      const totalCases = doctorCases.length;
      doctorDues.push({
        $id: doc.$id,
        name: doc.name,
        // due: Math.max(totalDue, 0),
        due: 0,
        totalCases: totalCases,
        unpaidCases: unpaidCases.length,
        paidCases: paidCases.length,
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
