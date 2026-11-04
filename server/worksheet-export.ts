import JSZip from "jszip";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { HWPXBuilder, write as writeHwpx } from "hwpx-js";

export type WorksheetExportFormat = "docx" | "hwpx";

export type ExportableWorksheetLevel = {
  worksheetTitle: string;
  levelLabel: string;
  title: string;
  learningGoal: string;
  content: string;
  answerGuide?: string;
};

export type WorksheetExport = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

const exportFormats: Record<WorksheetExportFormat, { extension: string; mimeType: string }> = {
  docx: {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  hwpx: {
    extension: "hwpx",
    mimeType: "application/vnd.hancom.hwpx",
  },
};

export function sanitizeExportFilename(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "학습지";
}

export function worksheetContentParagraphs(content: string) {
  return content
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0);
}

const studentInfoText = "학교: ____________________    학년: ______    반: ______    번호: ______    이름: ____________________";

function answerGuideLines(answerGuide?: string) {
  return answerGuide ? worksheetContentParagraphs(answerGuide) : [];
}

async function makeDocx(input: ExportableWorksheetLevel, includeAnswerGuide: boolean) {
  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: input.title, bold: true, size: 34, font: "맑은 고딕" })],
      spacing: { after: 140 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: input.levelLabel, bold: true, size: 22, font: "맑은 고딕" })],
      spacing: { after: 260 },
    }),
    new Paragraph({
      children: [new TextRun({ text: studentInfoText, font: "맑은 고딕", size: 19 })],
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "학습 목표  ", bold: true, font: "맑은 고딕" }),
        new TextRun({ text: input.learningGoal, font: "맑은 고딕" }),
      ],
      spacing: { after: 320 },
    }),
    ...worksheetContentParagraphs(input.content).map(line => new Paragraph({
      children: [new TextRun({ text: line, font: "맑은 고딕", size: 22 })],
      spacing: { after: 180, line: 330 },
    })),
  ];

  if (includeAnswerGuide && answerGuideLines(input.answerGuide).length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "교사용 정답·피드백 안내", bold: true, font: "맑은 고딕", size: 24 })],
        spacing: { before: 440, after: 180 },
      }),
      ...answerGuideLines(input.answerGuide).map(line => new Paragraph({
        children: [new TextRun({ text: line, font: "맑은 고딕", size: 20 })],
        spacing: { after: 140, line: 300 },
      })),
    );
  }

  const document = new Document({
    creator: "다섯단계 학습지 스튜디오",
    title: `${input.worksheetTitle} - ${input.levelLabel}`,
    sections: [{
      properties: { page: { margin: { top: 980, right: 980, bottom: 980, left: 980 } } },
      children: paragraphs,
    }],
  });
  return Packer.toBuffer(document);
}

function makeHwpx(input: ExportableWorksheetLevel, includeAnswerGuide: boolean) {
  const builder = new HWPXBuilder()
    .setPageSettings({ width: 210, height: 297, marginTop: 20, marginRight: 20, marginBottom: 20, marginLeft: 20 })
    .addParagraph(input.title, { fontSize: 18, bold: true, fontName: "맑은 고딕" })
    .addParagraph(input.levelLabel, { fontSize: 12, bold: true, fontName: "맑은 고딕" })
    .addParagraph(studentInfoText, { fontSize: 10, fontName: "맑은 고딕" })
    .addEmptyParagraph()
    .addStyledText([
      { text: "학습 목표  ", style: { bold: true, fontSize: 11, fontName: "맑은 고딕" } },
      { text: input.learningGoal, style: { fontSize: 11, fontName: "맑은 고딕" } },
    ])
    .addEmptyParagraph();

  worksheetContentParagraphs(input.content).forEach(line => {
    builder.addParagraph(line, { fontSize: 11, fontName: "맑은 고딕" });
  });
  if (includeAnswerGuide && answerGuideLines(input.answerGuide).length > 0) {
    builder.addEmptyParagraph().addParagraph("교사용 정답·피드백 안내", { fontSize: 12, bold: true, fontName: "맑은 고딕" });
    answerGuideLines(input.answerGuide).forEach(line => builder.addParagraph(line, { fontSize: 10, fontName: "맑은 고딕" }));
  }
  return writeHwpx(builder.build(), { compress: true });
}

export async function createWorksheetExport(input: ExportableWorksheetLevel, format: WorksheetExportFormat, includeAnswerGuide = false): Promise<WorksheetExport> {
  const formatInfo = exportFormats[format];
  const bytes = format === "docx" ? await makeDocx(input, includeAnswerGuide) : makeHwpx(input, includeAnswerGuide);
  const baseName = sanitizeExportFilename(`${input.worksheetTitle}_${input.levelLabel}`);
  return { bytes, filename: `${baseName}.${formatInfo.extension}`, mimeType: formatInfo.mimeType };
}

export async function createWorksheetBundle(input: { worksheetTitle: string; levels: ExportableWorksheetLevel[] }, format: WorksheetExportFormat, includeAnswerGuide = false): Promise<WorksheetExport> {
  const zip = new JSZip();
  for (let index = 0; index < input.levels.length; index += 1) {
    const level = input.levels[index];
    const document = await createWorksheetExport(level, format, includeAnswerGuide);
    zip.file(`${String(index + 1).padStart(2, "0")}_${sanitizeExportFilename(level.levelLabel)}_${sanitizeExportFilename(level.title)}.${exportFormats[format].extension}`, document.bytes);
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return {
    bytes,
    filename: `${sanitizeExportFilename(input.worksheetTitle)}_5단계_전체묶음.zip`,
    mimeType: "application/zip",
  };
}
