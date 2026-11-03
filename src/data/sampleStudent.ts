// Everything in this file is invented for the demo: the student, the university,
// every merchant and every transaction. It is hand-written so you can read it
// like a story of one semester and check the dashboard's totals against it.

import type {
  Semester,
  StudentProfile,
  Transaction,
  TransactionCategory,
} from "@/lib/types";

export const student: StudentProfile = {
  name: "Maya Ellison",
  year: "Sophomore",
  major: "Biology",
  housing: "On-campus housing",
  school: "Larkspur State University",
  semesterBudgetCents: 240_000, // $2,400.00
};

export const semester: Semester = {
  name: "Fall 2026",
  startDate: "2026-08-24",
  totalWeeks: 16,
  events: [
    { week: 1, label: "Move-in" },
    { week: 7, label: "Midterms" },
    { week: 8, label: "Fall break" },
    { week: 14, label: "Thanksgiving" },
    { week: 16, label: "Finals" },
  ],
};

/** Where the timeline opens. The app never reads the real clock for this. */
export const snapshot = {
  date: "2026-11-01",
  week: 10,
};

// Short names keep the table below easy to scan.
const DEBIT = "Debit card";
const CAMPUS = "Campus card";

type Row = [
  date: string,
  merchant: string,
  category: TransactionCategory,
  amountCents: number,
  account: Transaction["account"],
];

const rows: Row[] = [
  // Week 1: move-in and textbooks
  ["2026-08-24", "Larkspur Campus Bookstore", "books", 18460, DEBIT],
  ["2026-08-24", "Tidewater Dorm & Home", "personal", 6218, DEBIT],
  ["2026-08-24", "Metro Student Transit Pass", "transport", 4500, DEBIT],
  ["2026-08-25", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-08-25", "Streamly", "subscriptions", 799, DEBIT],
  ["2026-08-26", "Corner Greens Market", "groceries", 3842, DEBIT],
  ["2026-08-26", "Quad Coffee Co.", "dining", 585, CAMPUS],
  ["2026-08-27", "Campus Print Center", "books", 640, CAMPUS],
  ["2026-08-28", "Bay Street Noodles", "dining", 1620, DEBIT],
  ["2026-08-29", "Late Night Slice", "dining", 975, DEBIT],
  ["2026-08-30", "Pillbox Pharmacy", "personal", 1438, DEBIT],
  // Week 2
  ["2026-08-31", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-09-01", "Quad Coffee Co.", "dining", 625, CAMPUS],
  ["2026-09-01", "Tunewave", "subscriptions", 599, DEBIT],
  ["2026-09-01", "Family transfer", "income", 30000, DEBIT],
  ["2026-09-02", "Corner Greens Market", "groceries", 2916, DEBIT],
  ["2026-09-03", "Larkspur Campus Bookstore", "books", 4275, DEBIT],
  ["2026-09-04", "Bay Street Noodles", "dining", 1480, DEBIT],
  ["2026-09-04", "Larkspur Library payroll", "income", 18640, DEBIT],
  ["2026-09-05", "Fall Welcome Fest", "social", 2000, DEBIT],
  ["2026-09-06", "CityHop Rides", "transport", 1365, DEBIT],
  // Week 3
  ["2026-09-08", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-09-08", "Quad Coffee Co.", "dining", 585, CAMPUS],
  ["2026-09-09", "Corner Greens Market", "groceries", 3377, DEBIT],
  ["2026-09-10", "Cloudnote", "subscriptions", 499, DEBIT],
  ["2026-09-11", "Late Night Slice", "dining", 1150, DEBIT],
  ["2026-09-12", "Bijou Cinema", "social", 1450, DEBIT],
  ["2026-09-13", "Rec Center Climbing Wall", "social", 1200, CAMPUS],
  // Week 4
  ["2026-09-14", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-09-15", "Quad Coffee Co.", "dining", 650, CAMPUS],
  ["2026-09-16", "Corner Greens Market", "groceries", 4108, DEBIT],
  ["2026-09-17", "Pillbox Pharmacy", "personal", 925, DEBIT],
  ["2026-09-18", "Bay Street Noodles", "dining", 1735, DEBIT],
  ["2026-09-18", "Larkspur Library payroll", "income", 18640, DEBIT],
  ["2026-09-19", "Larkspur Athletics Tickets", "social", 1800, DEBIT],
  ["2026-09-19", "CityHop Rides", "transport", 1120, DEBIT],
  ["2026-09-20", "Shear Luck Barbers", "personal", 2800, DEBIT],
  // Week 5
  ["2026-09-22", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-09-22", "Quad Coffee Co.", "dining", 585, CAMPUS],
  ["2026-09-23", "Corner Greens Market", "groceries", 3164, DEBIT],
  ["2026-09-24", "Campus Print Center", "books", 480, CAMPUS],
  ["2026-09-25", "Thai Basil Kitchen", "dining", 1895, DEBIT],
  ["2026-09-25", "Streamly", "subscriptions", 799, DEBIT],
  ["2026-09-26", "Thrift & Thread", "personal", 3150, DEBIT],
  ["2026-09-27", "Late Night Slice", "dining", 850, DEBIT],
  // Week 6: includes one large purchase, left unlabeled on purpose for a later milestone
  ["2026-09-28", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-09-29", "Quad Coffee Co.", "dining", 625, CAMPUS],
  ["2026-09-30", "Corner Greens Market", "groceries", 2890, DEBIT],
  ["2026-10-01", "Tunewave", "subscriptions", 599, DEBIT],
  ["2026-10-01", "Family transfer", "income", 30000, DEBIT],
  ["2026-10-02", "Northgate Electronics", "personal", 24900, DEBIT],
  ["2026-10-02", "Larkspur Library payroll", "income", 18640, DEBIT],
  ["2026-10-03", "Bay Street Noodles", "dining", 1390, DEBIT],
  ["2026-10-04", "Bijou Cinema", "social", 1450, DEBIT],
  // Week 7: midterms, more coffee and late food
  ["2026-10-05", "Quad Coffee Co.", "dining", 715, CAMPUS],
  ["2026-10-06", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-10-06", "Quad Coffee Co.", "dining", 650, CAMPUS],
  ["2026-10-07", "Corner Greens Market", "groceries", 2542, DEBIT],
  ["2026-10-08", "Late Night Slice", "dining", 1320, DEBIT],
  ["2026-10-09", "Campus Print Center", "books", 720, CAMPUS],
  ["2026-10-09", "Late Night Slice", "dining", 1075, DEBIT],
  ["2026-10-10", "Cloudnote", "subscriptions", 499, DEBIT],
  ["2026-10-11", "Thai Basil Kitchen", "dining", 2140, DEBIT],
  // Week 8: fall break trip
  ["2026-10-14", "Coastline Bus Lines", "transport", 6800, DEBIT],
  ["2026-10-15", "Corner Greens Market", "groceries", 1985, DEBIT],
  ["2026-10-16", "Harborview Hostel", "social", 7400, DEBIT],
  ["2026-10-16", "Larkspur Library payroll", "income", 18640, DEBIT],
  ["2026-10-17", "Pier 9 Fish Shack", "dining", 2465, DEBIT],
  // Week 9
  ["2026-10-19", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-10-20", "Quad Coffee Co.", "dining", 585, CAMPUS],
  ["2026-10-21", "Corner Greens Market", "groceries", 3621, DEBIT],
  ["2026-10-22", "Bay Street Noodles", "dining", 1550, DEBIT],
  ["2026-10-23", "Second Act Costumes", "social", 3275, DEBIT],
  ["2026-10-24", "CityHop Rides", "transport", 1480, DEBIT],
  ["2026-10-25", "Streamly", "subscriptions", 799, DEBIT],
  // Week 10
  ["2026-10-26", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-10-27", "Quad Coffee Co.", "dining", 650, CAMPUS],
  ["2026-10-28", "Corner Greens Market", "groceries", 3284, DEBIT],
  ["2026-10-29", "Pillbox Pharmacy", "personal", 1260, DEBIT],
  ["2026-10-30", "Late Night Slice", "dining", 1085, DEBIT],
  ["2026-10-30", "Larkspur Library payroll", "income", 18640, DEBIT],
  ["2026-10-31", "Quadfest Halloween", "social", 1500, DEBIT],
  ["2026-10-31", "CityHop Rides", "transport", 1640, DEBIT],
  ["2026-11-01", "Tunewave", "subscriptions", 599, DEBIT],
  ["2026-11-01", "Family transfer", "income", 30000, DEBIT],
  // Weeks 11-16 stay hidden until the timeline reaches them.
  // Week 11
  ["2026-11-03", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-11-04", "Corner Greens Market", "groceries", 3012, DEBIT],
  ["2026-11-05", "Quad Coffee Co.", "dining", 625, CAMPUS],
  ["2026-11-06", "Bay Street Noodles", "dining", 1510, DEBIT],
  ["2026-11-07", "Bijou Cinema", "social", 1450, DEBIT],
  // Week 12
  ["2026-11-09", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-11-10", "Cloudnote", "subscriptions", 499, DEBIT],
  ["2026-11-11", "Corner Greens Market", "groceries", 3488, DEBIT],
  ["2026-11-13", "Larkspur Library payroll", "income", 18640, DEBIT],
  ["2026-11-14", "Late Night Slice", "dining", 1020, DEBIT],
  ["2026-11-15", "Campus Print Center", "books", 560, CAMPUS],
  // Week 13
  ["2026-11-16", "Quad Coffee Co.", "dining", 650, CAMPUS],
  ["2026-11-17", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-11-18", "Corner Greens Market", "groceries", 2756, DEBIT],
  ["2026-11-20", "Thrift & Thread", "personal", 2640, DEBIT],
  ["2026-11-21", "CityHop Rides", "transport", 1290, DEBIT],
  // Week 14: Thanksgiving travel
  ["2026-11-24", "Coastline Bus Lines", "transport", 7400, DEBIT],
  ["2026-11-25", "Streamly", "subscriptions", 799, DEBIT],
  ["2026-11-29", "Corner Greens Market", "groceries", 1845, DEBIT],
  // Week 15
  ["2026-11-30", "Commons Dining Hall", "dining", 1175, CAMPUS],
  ["2026-12-01", "Tunewave", "subscriptions", 599, DEBIT],
  ["2026-12-01", "Family transfer", "income", 30000, DEBIT],
  ["2026-12-02", "Corner Greens Market", "groceries", 3215, DEBIT],
  ["2026-12-03", "Campus Print Center", "books", 840, CAMPUS],
  ["2026-12-05", "Thai Basil Kitchen", "dining", 1985, DEBIT],
  // Week 16: finals
  ["2026-12-07", "Quad Coffee Co.", "dining", 715, CAMPUS],
  ["2026-12-08", "Quad Coffee Co.", "dining", 650, CAMPUS],
  ["2026-12-09", "Late Night Slice", "dining", 1240, DEBIT],
  ["2026-12-10", "Corner Greens Market", "groceries", 2230, DEBIT],
  ["2026-12-11", "Larkspur Library payroll", "income", 18640, DEBIT],
  ["2026-12-12", "Coastline Bus Lines", "transport", 6800, DEBIT],
];

export const transactions: Transaction[] = rows.map(
  ([date, merchant, category, amountCents, account], index) => ({
    id: `txn_${String(index + 1).padStart(3, "0")}`,
    date,
    merchant,
    category,
    amountCents,
    direction: category === "income" ? "credit" : "debit",
    account,
  }),
);
