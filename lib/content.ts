export type Inline =
  | { type: "text"; text: string }
  | { type: "highlight"; id: string; text: string }
  | { type: "term"; term: string; def: string };

export type Paragraph = {
  id: string;
  page?: number;
  dropcap?: boolean;
  inline: Inline[];
};

export type Section = {
  id: string;
  title: string;
  pageStart: number;
  summary: string;
  keyTerms: { term: string; def: string }[];
  paragraphs: Paragraph[];
};

const t = (text: string): Inline => ({ type: "text", text });
const h = (id: string, text: string): Inline => ({ type: "highlight", id, text });
const k = (term: string, def: string): Inline => ({ type: "term", term, def });

export const bookTitle = "The Practice of History";
export const bookAuthor = "An Introduction to the Discipline";

export const sections: Section[] = [
  {
    id: "introduction",
    title: "Introduction",
    pageStart: 1,
    summary:
      "History is not a record of the past but a discipline for asking ordered questions about it. The introduction frames the book's wager: method matters more than memorization.",
    keyTerms: [
      {
        term: "historiography",
        def: "The study of how history is written — the methods, frames, and assumptions historians bring to the past.",
      },
      {
        term: "periodization",
        def: "The dividing of continuous time into eras for analytic convenience; always a construction, never a discovery.",
      },
    ],
    paragraphs: [
      {
        id: "p-intro-1",
        page: 1,
        dropcap: true,
        inline: [
          h(
            "hi-intro-1",
            "History is the discipline of asking ordered questions about the past."
          ),
          t(
            " It is neither the past itself nor a faithful chronicle of it, but a structured inquiry — one that demands of its practitioners the same patience and skepticism we expect of any serious craft. The student who comes to history hoping for stories will find them, in abundance; but the historian's labor begins where the storytelling ends, with the slow work of judging evidence and weighing interpretation."
          ),
        ],
      },
      {
        id: "p-intro-2",
        page: 2,
        inline: [
          t("The questions we ask, and the methods we use to answer them, are themselves products of history. "),
          k(
            "Historiography",
            "The study of how history is written — the methods, frames, and assumptions historians bring to the past."
          ),
          t(
            " — the study of how history has been written — is therefore not an optional supplement to historical study but its proper foundation. To know what the past meant we must know how previous generations have tried to make it speak."
          ),
        ],
      },
      {
        id: "p-intro-3",
        page: 2,
        inline: [
          t("This book proposes a working argument: that "),
          h(
            "hi-intro-3",
            "the value of history lies not in its conclusions but in the rigor with which conclusions are reached."
          ),
          t(
            " The chapters that follow are organized around problems rather than periods. Each problem stages a tension that students of history must learn to inhabit rather than resolve."
          ),
        ],
      },
    ],
  },
  {
    id: "organization",
    title: "Organization of the Book",
    pageStart: 4,
    summary:
      "Four problems anchor the book: causes, scale, evidence, and standards. Each is presented as a working tension rather than a doctrine to be memorized.",
    keyTerms: [
      {
        term: "prime mover",
        def: "A cause taken to be foundational — the explanation behind the explanations.",
      },
    ],
    paragraphs: [
      {
        id: "p-org-1",
        page: 4,
        inline: [
          t(
            "The book is organized around four problems. The first concerns causes: how do historians decide what counts as a "
          ),
          k("prime mover", "A cause taken to be foundational — the explanation behind the explanations."),
          t(
            " of historical change? The second concerns scale: at what altitude should the past be viewed? The third concerns evidence, and the fourth, standards of judgment."
          ),
        ],
      },
      {
        id: "p-org-2",
        page: 5,
        inline: [
          h(
            "hi-org-1",
            "Each problem is a tension, not a doctrine."
          ),
          t(
            " Readers should expect to leave each chapter with sharper questions, not settled answers. The chapter exercises are designed to surface disagreement, and the suggested readings deliberately put dissenting authors beside one another."
          ),
        ],
      },
    ],
  },
  {
    id: "prime-movers",
    title: "Problem One: Prime Movers",
    pageStart: 7,
    summary:
      "What drives historical change? Geography, economy, ideology, technology, accident — each candidate prime mover illuminates and distorts. The historian's task is to weigh, not to crown.",
    keyTerms: [
      {
        term: "structural cause",
        def: "A long-running condition (geography, climate, demography) that constrains the field of possible events.",
      },
      {
        term: "contingent cause",
        def: "A short-range trigger or accident that selects among possibilities the structures left open.",
      },
    ],
    paragraphs: [
      {
        id: "p-prime-1",
        page: 7,
        dropcap: true,
        inline: [
          t("Every generation of historians inherits a favored "),
          k("prime mover", "A cause taken to be foundational — the explanation behind the explanations."),
          t(
            " — the engine behind the engines. For Marx it was the mode of production; for Weber, the disenchanting force of rationalization; for Braudel, the slow grammar of geography and climate. Each candidate illuminates a great deal and obscures the rest."
          ),
        ],
      },
      {
        id: "p-prime-2",
        page: 8,
        inline: [
          h(
            "hi-prime-1",
            "The historian's task is not to crown a single prime mover but to weigh them against one another in the specific case at hand."
          ),
          t(
            " The temptation of monocausal explanation is precisely its elegance: a single key promises to open every lock. But the past, stubbornly, has many locks."
          ),
        ],
      },
      {
        id: "p-prime-3",
        page: 9,
        inline: [
          t("It is useful to distinguish "),
          k(
            "structural causes",
            "Long-running conditions (geography, climate, demography) that constrain the field of possible events."
          ),
          t(" from "),
          k(
            "contingent causes",
            "Short-range triggers or accidents that select among possibilities the structures left open."
          ),
          t(
            " — the long, slow conditions that shape the field of possibility from the short, sharp triggers that decide outcomes within it. A famine prepares a revolution; an assassination ignites one. Neither alone is sufficient; together they are still not the whole story."
          ),
        ],
      },
      {
        id: "p-prime-4",
        page: 10,
        inline: [
          t("Consider the collapse of the western Roman state in the fifth century. Was its prime mover demographic exhaustion, fiscal overreach, climatic shift, or the migration of peoples displaced by pressures further east? "),
          h(
            "hi-prime-2",
            "The honest answer is that no single mover suffices, and the historian who insists otherwise is no longer doing history."
          ),
          t(
            " She is doing something else — perhaps philosophy, perhaps politics — under the borrowed dignity of historical evidence."
          ),
        ],
      },
    ],
  },
  {
    id: "global-history",
    title: "Problem Two: Global History",
    pageStart: 14,
    summary:
      "Choosing a scale of analysis is itself an argument. Local case studies reveal texture; global frames reveal pattern. Neither is neutral.",
    keyTerms: [
      {
        term: "microhistory",
        def: "A close-grained study of a single life, village, or event, mined for its larger implications.",
      },
    ],
    paragraphs: [
      {
        id: "p-global-1",
        page: 14,
        inline: [
          t("To do "),
          k(
            "microhistory",
            "A close-grained study of a single life, village, or event, mined for its larger implications."
          ),
          t(
            " is to argue that the texture of a life or a village contains enough structure to illuminate the age. To do global history is to argue that no national or regional frame can do justice to phenomena — empires, epidemics, commodities, ideas — that travel."
          ),
        ],
      },
      {
        id: "p-global-2",
        page: 15,
        inline: [
          h(
            "hi-global-1",
            "Every choice of scale is an argument about what matters."
          ),
          t(
            " The historian who studies only the village is not innocent of the world; she has decided, by her silence, that the world is less explanatory than the village. The reverse holds, too. There is no scale at which one merely 'looks.'"
          ),
        ],
      },
    ],
  },
  {
    id: "standards",
    title: "Conforming to Standards",
    pageStart: 22,
    summary:
      "What separates good history from bad? Standards of evidence, transparent reasoning, and willingness to be wrong in public.",
    keyTerms: [
      {
        term: "falsifiability",
        def: "The property of a claim such that it can, in principle, be shown wrong by evidence.",
      },
    ],
    paragraphs: [
      {
        id: "p-std-1",
        page: 22,
        dropcap: true,
        inline: [
          t(
            "Standards in history are not enforced by a single authority — there is no historian's bar exam — but they are not therefore arbitrary. They emerge from disciplined conversation: peer review, citation practice, public argument, and the slow accumulation of consensus around what counts as a good question well asked."
          ),
        ],
      },
      {
        id: "p-std-2",
        page: 23,
        inline: [
          h(
            "hi-std-1",
            "A claim that no evidence could ever disturb is not history; it is faith dressed in archival clothing."
          ),
          t(" The historian commits, in principle, to "),
          k(
            "falsifiability",
            "The property of a claim such that it can, in principle, be shown wrong by evidence."
          ),
          t(
            " — to making claims that could be undone by a better source, a more careful reading, or an unexpected find. This is not a counsel of timidity but of courage: to be wrong in public is the price of saying anything useful at all."
          ),
        ],
      },
    ],
  },
];
