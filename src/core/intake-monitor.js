// Intake App Business Monitor
// Jarvis uses this to track Intake as a business (CEO view)
// Uses service_key to bypass RLS and see all user data

const { supabase } = require('../db/supabase');

async function getIntakeMetrics() {
  try {
    const { data, error } = await supabase
      .from('intake_business_metrics')
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.log('Intake metrics error:', err.message);
    return null;
  }
}

async function getIntakeDailyActiveUsers() {
  try {
    const { data, error } = await supabase
      .from('intake_daily_active_users')
      .select('*')
      .limit(30);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.log('Intake DAU error:', err.message);
    return [];
  }
}

async function getIntakeFeatureUsage() {
  try {
    const { data, error } = await supabase
      .from('intake_feature_usage')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.log('Intake feature usage error:', err.message);
    return [];
  }
}

async function getIntakeConversionFunnel() {
  try {
    const { data, error } = await supabase
      .from('intake_conversion_funnel')
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.log('Intake funnel error:', err.message);
    return null;
  }
}

// Full business report for Jarvis agent cycle or morning briefing
async function getIntakeBusinessReport() {
  const [metrics, dau, features, funnel] = await Promise.all([
    getIntakeMetrics(),
    getIntakeDailyActiveUsers(),
    getIntakeFeatureUsage(),
    getIntakeConversionFunnel(),
  ]);

  if (!metrics) return 'Intake tables not set up yet — schema needs to be run in Supabase.';

  const report = [
    '📱 INTAKE APP BUSINESS REPORT',
    '═══════════════════════════════',
    '',
    `👥 Total Users: ${metrics.total_users}`,
    `📈 Signups Today: ${metrics.signups_today} | This Week: ${metrics.signups_this_week}`,
    `🔥 Active Today: ${metrics.active_users_today} | This Week: ${metrics.active_users_week}`,
    `📸 AI Scans Today: ${metrics.ai_scans_today}`,
    `📊 Total Food Entries: ${metrics.total_food_entries}`,
    '',
    '💰 REVENUE',
    `   Plus Subscribers: ${metrics.plus_subscribers}`,
    `   Pro Subscribers: ${metrics.pro_subscribers}`,
    `   Total Paying: ${metrics.total_paying}`,
    `   Est. Monthly Revenue: $${metrics.monthly_revenue_estimate}`,
    '',
  ];

  if (funnel) {
    const signupToLog = metrics.total_users > 0
      ? Math.round((funnel.users_with_first_log / metrics.total_users) * 100)
      : 0;
    const logToRetained = funnel.users_with_first_log > 0
      ? Math.round((funnel.retained_7_days / funnel.users_with_first_log) * 100)
      : 0;
    const retainedToPaid = funnel.retained_7_days > 0
      ? Math.round((funnel.converted_to_paid / funnel.retained_7_days) * 100)
      : 0;

    report.push(
      '🔄 CONVERSION FUNNEL',
      `   Signup → First Log: ${signupToLog}% (${funnel.users_with_first_log}/${metrics.total_users})`,
      `   First Log → 7-Day Retained: ${logToRetained}% (${funnel.retained_7_days}/${funnel.users_with_first_log})`,
      `   Retained → Paid: ${retainedToPaid}% (${funnel.converted_to_paid}/${funnel.retained_7_days})`,
      '',
    );
  }

  if (features && features.length > 0) {
    report.push('🛠️ FEATURE USAGE');
    features.forEach(f => {
      report.push(`   ${f.source}: ${f.total_uses} uses (${f.unique_users} users) | ${f.uses_this_week} this week`);
    });
  }

  return report.join('\n');
}

module.exports = {
  getIntakeMetrics,
  getIntakeDailyActiveUsers,
  getIntakeFeatureUsage,
  getIntakeConversionFunnel,
  getIntakeBusinessReport,
};
