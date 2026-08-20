// ============================================
// PERSONAL GRADING SYSTEM
// SUPABASE CONNECTION
// ============================================

const SUPABASE_URL = "https://julbkukshbjkstnfhdrw.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_2R7dxY2-PtWBZWg2IgyZkA_Epfy129v";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const supabaseClient = window.supabaseClient;
console.log("Supabase client initialized.");

async function testSupabaseConnection() {
  try {
    const { data, error } = await supabaseClient
      .from("students")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Supabase connection test failed:", error);
      return;
    }

    console.log("✅ Supabase connection successful.");
  } catch (error) {
    console.error("Supabase connection error:", error);
  }
}

testSupabaseConnection();
