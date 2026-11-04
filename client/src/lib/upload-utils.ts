export type PreparedUploadPayload = {
  name: string;
  mimeType: string;
  base64: string;
  sourceText?: string;
};

const MAX_SAFE_VERCEL_BINARY_BYTES = 3_400_000; // ~4.5 MB after base64 + JSON envelope
const MAX_IMAGE_INPUT_BYTES = 15_000_000; // 15 MB raw photo before client-side compression
const MAX_IMAGE_DIMENSION = 2000;

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
    reader.readAsDataURL(blob);
  });
}

async function compressImageIfNeeded(file: File): Promise<{ blob: Blob; mimeType: string }> {
  if (typeof window === "undefined" || typeof document === "undefined" || !("createImageBitmap" in window)) {
    return { blob: file, mimeType: file.type };
  }
  if (file.size <= 900_000) {
    return { blob: file, mimeType: file.type };
  }

  try {
    const bitmap = await window.createImageBitmap(file);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    const scale = maxSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxSide : 1;
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, mimeType: file.type };
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const compressedBlob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.84);
    });

    if (compressedBlob && compressedBlob.size < file.size) {
      return { blob: compressedBlob, mimeType: "image/jpeg" };
    }
    return { blob: file, mimeType: file.type };
  } catch {
    return { blob: file, mimeType: file.type };
  }
}

export async function prepareWorksheetFileUpload(file: File): Promise<PreparedUploadPayload> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  const isText = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");

  if (!isImage && !isPdf && !isText) {
    throw new Error("PDF, 이미지(JPG·PNG·WEBP), 텍스트(TXT) 파일만 업로드할 수 있습니다.");
  }

  if (isImage) {
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      throw new Error("이미지 파일은 15MB 이하만 업로드할 수 있습니다.");
    }
    const { blob, mimeType } = await compressImageIfNeeded(file);
    if (blob.size > MAX_SAFE_VERCEL_BINARY_BYTES) {
      throw new Error("압축 후에도 이미지 용량이 너무 큽니다. 해상도를 낮추어 다시 시도해 주세요.");
    }
    const base64 = await readBlobAsDataUrl(blob);
    return {
      name: file.name,
      mimeType,
      base64,
    };
  }

  if (isPdf) {
    if (file.size > MAX_SAFE_VERCEL_BINARY_BYTES) {
      throw new Error(
        "서버리스 전송 한도(약 3.4MB)를 초과하는 PDF입니다. 필요한 페이지만 추출하거나 '텍스트 직접 입력' 탭을 이용해 주세요."
      );
    }
    const base64 = await readBlobAsDataUrl(file);
    return {
      name: file.name,
      mimeType: "application/pdf",
      base64,
    };
  }

  // Plain text file
  if (file.size > 1_000_000) {
    throw new Error("텍스트 파일은 1MB 이하로 업로드해 주세요.");
  }
  const sourceText = (await file.text()).trim();
  if (!sourceText) {
    throw new Error("비어 있는 텍스트 파일입니다. 문제 내용이 포함된 파일을 선택해 주세요.");
  }
  const base64 = await readBlobAsDataUrl(file);
  return {
    name: file.name,
    mimeType: "text/plain",
    base64,
    sourceText: sourceText.slice(0, 48_000),
  };
}

export function prepareDirectTextUpload(title: string, rawText: string): PreparedUploadPayload {
  const trimmed = rawText.trim();
  if (trimmed.length < 5) {
    throw new Error("변환할 학습지 지문이나 문항 내용을 5자 이상 입력해 주세요.");
  }
  const safeTitle = (title.trim() || "직접 입력 학습지").slice(0, 120);
  const encoded = btoa(unescape(encodeURIComponent(trimmed.slice(0, 48_000))));
  return {
    name: `${safeTitle}.txt`,
    mimeType: "text/plain",
    base64: `data:text/plain;base64,${encoded}`,
    sourceText: trimmed.slice(0, 48_000),
  };
}

