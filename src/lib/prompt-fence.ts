/*
 * The AI prompts put untrusted text between <<< and >>> and tell the model it is data. Text that contains those
 * marks could close the fence early and have the rest read as instructions, so every field that goes into a fence
 * is cleaned first: each run of < or > becomes one look-alike angle quote, which cannot form a fence mark.
 */
export function fenceSafe(text: string): string {
  return text.replace(/<+/g, "‹").replace(/>+/g, "›");
}
