"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      使用浏览器打印
    </button>
  );
}
