export type SessionValidationResult = "valid" | "expired" | "unavailable";

export async function validateSessionResponse(request: () => Promise<Response>): Promise<SessionValidationResult> {
  try {
    const response = await request();
    if (response.ok) return "valid";
    return response.status === 401 ? "expired" : "unavailable";
  } catch {
    // A network failure does not prove that the user's credentials expired.
    return "unavailable";
  }
}
