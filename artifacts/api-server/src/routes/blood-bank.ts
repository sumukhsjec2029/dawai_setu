import { Router, type IRouter } from "express";

const router: IRouter = Router();

type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

const reportedAt = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

const records = [
  ["KMC-BB-A-POS", "Kasturba Medical Centre Blood Centre", "hospital", "Manipal", "Tiger Circle, Manipal", "Anitha Rao", "+91 820 292 1181", "A+", 24, 0.8, "surplus", 8],
  ["KMC-BB-O-POS", "Kasturba Medical Centre Blood Centre", "hospital", "Manipal", "Tiger Circle, Manipal", "Anitha Rao", "+91 820 292 1181", "O+", 12, 0.8, "available", 10],
  ["KMC-BB-B-POS", "Kasturba Medical Centre Blood Centre", "hospital", "Manipal", "Tiger Circle, Manipal", "Anitha Rao", "+91 820 292 1181", "B+", 8, 0.8, "available", 12],
  ["KMC-BB-AB-POS", "Kasturba Medical Centre Blood Centre", "hospital", "Manipal", "Tiger Circle, Manipal", "Anitha Rao", "+91 820 292 1181", "AB+", 4, 0.8, "low", 14],
  ["DH-UDP-BB-O-POS", "District Hospital Udupi Blood Bank", "hospital", "Udupi", "Ajjarkad, Udupi", "Ramesh Bhat", "+91 820 252 0555", "O+", 30, 8.4, "surplus", 16],
  ["DH-UDP-BB-A-NEG", "District Hospital Udupi Blood Bank", "hospital", "Udupi", "Ajjarkad, Udupi", "Ramesh Bhat", "+91 820 252 0555", "A-", 6, 8.4, "available", 18],
  ["DH-UDP-BB-B-NEG", "District Hospital Udupi Blood Bank", "hospital", "Udupi", "Ajjarkad, Udupi", "Ramesh Bhat", "+91 820 252 0555", "B-", 3, 8.4, "low", 18],
  ["WEN-MNG-BB-A-POS", "Government Wenlock Hospital Blood Centre", "hospital", "Mangalore", "Hampankatta, Mangalore", "Shalini Shetty", "+91 824 242 1404", "A+", 40, 55.2, "surplus", 22],
  ["WEN-MNG-BB-O-POS", "Government Wenlock Hospital Blood Centre", "hospital", "Mangalore", "Hampankatta, Mangalore", "Shalini Shetty", "+91 824 242 1404", "O+", 22, 55.2, "surplus", 24],
  ["WEN-MNG-BB-B-POS", "Government Wenlock Hospital Blood Centre", "hospital", "Mangalore", "Hampankatta, Mangalore", "Shalini Shetty", "+91 824 242 1404", "B+", 14, 55.2, "available", 27],
  ["MAN-LAB-A-POS", "Manipal Laboratory Services", "lab", "Manipal", "Eshwar Nagar, Manipal", "Kiran Nayak", "+91 820 292 6077", "A+", 11, 2.1, "available", 31],
  ["MAN-LAB-O-NEG", "Manipal Laboratory Services", "lab", "Manipal", "Eshwar Nagar, Manipal", "Kiran Nayak", "+91 820 292 6077", "O-", 6, 2.1, "available", 31],
  ["MAN-LAB-AB-POS", "Manipal Laboratory Services", "lab", "Manipal", "Eshwar Nagar, Manipal", "Kiran Nayak", "+91 820 292 6077", "AB+", 2, 2.1, "low", 31],
  ["ARO-LAB-B-POS", "Arogya Diagnostics Lab", "lab", "Udupi", "Brahmagiri, Udupi", "Nandini Hegde", "+91 820 252 3388", "B+", 18, 9.2, "available", 38],
  ["ARO-LAB-O-POS", "Arogya Diagnostics Lab", "lab", "Udupi", "Brahmagiri, Udupi", "Nandini Hegde", "+91 820 252 3388", "O+", 26, 9.2, "surplus", 38],
  ["COAST-BB-A-NEG", "Coastal Care Hospital Blood Bank", "hospital", "Udupi", "Kinnimulki, Udupi", "Joseph D'Souza", "+91 820 252 7788", "A-", 9, 10.3, "available", 45],
  ["COAST-BB-AB-NEG", "Coastal Care Hospital Blood Bank", "hospital", "Udupi", "Kinnimulki, Udupi", "Joseph D'Souza", "+91 820 252 7788", "AB-", 1, 10.3, "low", 45],
] as const;

const toRecord = (row: (typeof records)[number]) => ({
  id: row[0],
  facilityName: row[1],
  facilityType: row[2] as "hospital" | "lab",
  city: row[3],
  address: row[4],
  contactName: row[5],
  contactPhone: row[6],
  bloodGroup: row[7] as BloodGroup,
  units: row[8],
  distanceKm: row[9],
  status: row[10] as "surplus" | "available" | "low",
  lastUpdated: reportedAt(row[11]),
});

router.get("/blood-bank", (req, res) => {
  const group = typeof req.query.group === "string" ? req.query.group.trim().toUpperCase() : "";
  const city = typeof req.query.city === "string" ? req.query.city.trim().toLowerCase() : "";
  const query = typeof req.query.query === "string" ? req.query.query.trim().toLowerCase() : "";

  const filtered = records
    .map(toRecord)
    .filter((record) => !group || record.bloodGroup === group)
    .filter((record) => !city || record.city.toLowerCase() === city)
    .filter((record) =>
      !query ||
      `${record.facilityName} ${record.city} ${record.address} ${record.bloodGroup}`
        .toLowerCase()
        .includes(query),
    );

  return res.json(filtered);
});

export default router;