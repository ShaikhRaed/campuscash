// A small hand-written test set. "relevant" lists the passages that answer each
// question. The same author wrote the passages and these questions, so results may be
// optimistic. Phrasing avoids copying the passages where that reads naturally.

export const ANSWERABLE_QUESTIONS: { question: string; relevant: string[] }[] = [
  { question: "Can I rent my textbooks instead of buying them?", relevant: ["books-rental"] },
  { question: "Is there a free way to read assigned books at the library?", relevant: ["books-reserve"] },
  { question: "How much money can I get back selling used textbooks?", relevant: ["books-buyback"] },
  { question: "I found the same book cheaper online, will the store match it?", relevant: ["books-pricematch"] },
  { question: "My laptop was stolen and I cannot afford a new one, is there any help?", relevant: ["fund-eligibility"] },
  { question: "What is the largest emergency grant and do I repay it?", relevant: ["fund-amount"] },
  { question: "How do I apply for hardship money and how long does it take?", relevant: ["fund-apply"] },
  { question: "Will the emergency fund pay my parking ticket?", relevant: ["fund-exclusions"] },
  { question: "When is the food pantry open?", relevant: ["pantry-hours"] },
  { question: "Do I need to prove my income to get free groceries?", relevant: ["pantry-eligibility"] },
  { question: "I ran out of food money, can I get free meals at the dining hall?", relevant: ["pantry-mealswipes"] },
  { question: "What should I do if I lose my student card?", relevant: ["card-lost"] },
  { question: "Can I get my leftover card balance back when I graduate?", relevant: ["card-refund"] },
  { question: "What is the deadline to lower my meal plan?", relevant: ["card-dining"] },
  { question: "There is a charge on my campus card I don't recognize, what do I do?", relevant: ["card-charge"] },
  { question: "When will my financial aid refund arrive?", relevant: ["aid-refund"] },
  { question: "What GPA do I need to keep my federal aid?", relevant: ["aid-sap"] },
  { question: "My parents lost income, can my aid award change?", relevant: ["aid-appeal"] },
  { question: "Is there someone who can help me make a budget?", relevant: ["aid-counseling"] },
  { question: "How much is the student bus pass and what does it cover?", relevant: ["transit-cost"] },
  { question: "Where do I buy a transit pass and how do I use it?", relevant: ["transit-activate"] },
  { question: "Is there a free shuttle at night?", relevant: ["transit-saferide"] },
  { question: "How often do student workers get paid?", relevant: ["jobs-pay"] },
  { question: "How many hours can I work on campus each week?", relevant: ["jobs-hours"] },
  { question: "Does work study money go straight to my tuition?", relevant: ["jobs-workstudy"] },
];

/** Topics the sources do not cover. The right behavior is to say so. */
export const UNANSWERABLE_QUESTIONS: string[] = [
  "What is the fine for parking in a faculty lot?",
  "How much does graduate tuition cost per credit?",
  "Which campus gym has the best climbing wall?",
  "When does the spring semester start?",
  "Can I get a loan for buying a car?",
  "What is the wifi password for the dorms?",
  "How do I apply for a Fulbright scholarship?",
  "Who won the football game last weekend?",
];

// Held-out set: written after the coverage threshold was adjusted using the questions
// above, and scored once, so the threshold was not tuned on these. Same author, though.
export const HELD_OUT_ANSWERABLE: { question: string; relevant: string[] }[] = [
  { question: "By what day do rented books have to come back?", relevant: ["books-rental"] },
  { question: "How long can I borrow a reserve copy from the library?", relevant: ["books-reserve"] },
  { question: "Could the emergency fund help after a surprise medical bill?", relevant: ["fund-eligibility"] },
  { question: "Where is the pantry located on campus?", relevant: ["pantry-hours"] },
  { question: "How many donated meal swipes can one student request?", relevant: ["pantry-mealswipes"] },
  { question: "What does a replacement campus card cost?", relevant: ["card-lost"] },
  { question: "Does my Campus Cash carry over to the spring?", relevant: ["card-refund"] },
  { question: "Does the transit pass work on airport buses?", relevant: ["transit-cost"] },
  { question: "What hours does the SafeRide shuttle run?", relevant: ["transit-saferide"] },
  { question: "Can undergraduates work more hours during breaks?", relevant: ["jobs-hours"] },
];

export const HELD_OUT_UNANSWERABLE: string[] = [
  "How do I join the campus chess club?",
  "What time does the swimming pool close?",
  "Which professor teaches organic chemistry?",
  "How much does a dorm room cost next year?",
  "Can international students open a bank account nearby?",
];
