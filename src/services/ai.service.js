const { GoogleGenAI } = require("@google/genai");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
});

// ==========================================
// JSON SCHEMA FOR GEMINI
// ==========================================

const interviewReportJsonSchema = {
  type: "object",

  properties: {
    matchScore: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description:
        "A score between 0 and 100 indicating how well the candidate matches the job description.",
    },

    technicalQuestions: {
      type: "array",

      items: {
        type: "object",

        properties: {
          question: {
            type: "string",
            description:
              "A technical question that can be asked in the interview.",
          },

          intention: {
            type: "string",
            description:
              "The intention of the interviewer behind asking this question.",
          },

          answer: {
            type: "string",
            description:
              "How the candidate should answer this question, including important points and approach.",
          },
        },

        required: ["question", "intention", "answer"],
      },

      description:
        "Technical interview questions along with their intention and suggested answers.",
    },

    behavioralQuestions: {
      type: "array",

      items: {
        type: "object",

        properties: {
          question: {
            type: "string",
            description:
              "A behavioral question that can be asked in the interview.",
          },

          intention: {
            type: "string",
            description:
              "The intention of the interviewer behind asking this question.",
          },

          answer: {
            type: "string",
            description:
              "How the candidate should answer this behavioral question.",
          },
        },

        required: ["question", "intention", "answer"],
      },

      description:
        "Behavioral interview questions along with their intention and suggested answers.",
    },

    skillGaps: {
      type: "array",

      items: {
        type: "object",

        properties: {
          skill: {
            type: "string",
            description: "The skill which the candidate is lacking.",
          },

          severity: {
            type: "string",
            enum: ["low", "medium", "high"],
            description:
              "The severity of the skill gap and how much it impacts the candidate's chances.",
          },
        },

        required: ["skill", "severity"],
      },

      description:
        "List of skill gaps in the candidate profile along with their severity.",
    },

    preparationPlan: {
      type: "array",

      items: {
        type: "object",

        properties: {
          day: {
            type: "number",
            description:
              "The day number in the preparation plan, starting from 1.",
          },

          focus: {
            type: "string",
            description: "The main focus of this day in the preparation plan.",
          },

          tasks: {
            type: "array",

            items: {
              type: "string",
            },

            description:
              "List of tasks the candidate should complete on this day.",
          },
        },

        required: ["day", "focus", "tasks"],
      },

      description: "A day-wise preparation plan for the candidate.",
    },
    title: {
      type: "string",
      description:
        "The title of the job for which the interview report is generated",
    },
  },

  required: [
    "matchScore",
    "technicalQuestions",
    "behavioralQuestions",
    "skillGaps",
    "preparationPlan",
  ],
};

// ==========================================
// ZOD SCHEMA FOR VALIDATION
// ==========================================

const interviewReportSchema = z.fromJSONSchema(interviewReportJsonSchema);

// ==========================================
// GENERATE REPORT
// ==========================================

async function generateInterviewReport({
  resume,
  selfDescription,
  jobDescription,
}) {
  const prompt = `
Generate a detailed interview preparation report for the candidate.

Analyze the candidate's resume, self-description, and job description.

RESUME:
${resume}

SELF DESCRIPTION:
${selfDescription}

JOB DESCRIPTION:
${jobDescription}

Provide:

1. Match score between 0 and 100.
2. Relevant technical interview questions.
3. Relevant behavioral interview questions.
4. Important skill gaps.
5. A practical day-wise interview preparation plan.

Base the analysis only on the candidate information and job description provided.
`;

  const response = await ai.interactions.create({
    model: "gemini-3-flash-preview",

    input: prompt,

    response_format: {
      type: "text",

      mime_type: "application/json",

      // IMPORTANT:
      // Send JSON Schema, NOT Zod schema
      schema: interviewReportJsonSchema,
    },
  });

  const result = JSON.parse(response.output_text);

  // Validate Gemini response using Zod
  const validatedResult = interviewReportSchema.parse(result);

  //   console.log("Validated result:");

  //   console.dir(validatedResult, {
  //     depth: null,
  //   });

  return validatedResult;
}

async function generatePdfFromHtml(htmlContent) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "15mm",
      right: "15mm",
    },
  });

  await browser.close();

  return pdfBuffer;
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
  const resumePdfSchema = z.object({
    html: z
      .string()
      .describe(
        "The html content of the resume which can be converted to PDF using any library like puppeteer",
      ),
  });
  const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(interviewReportSchema),
    },
  });

  const jsonContent = JSON.parse(response.text);

  const pdfBuffer = await generatePdfFromHtml(jsonContent.html);

  return pdfBuffer;
}

module.exports = { generateInterviewReport, generateResumePdf };
