import { Link } from "react-router";
import { CONTACT_URL, LegalLayout } from "./LegalLayout";

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This policy explains what LiftLedger collects, why, who it's shared with and what control
        you have over it. The short version: we collect what's needed to show you your own training,
        nutrition and health data, and we don't sell it, advertise with it or use it to train AI
        models.
      </p>

      <h2>1. What we collect</h2>
      <p>
        <strong>Account.</strong> Your email address and password. Passwords are stored only as a
        salted hash by our authentication provider. We also record when you accepted these policies.
      </p>
      <p>
        <strong>Profile.</strong> Information you choose to add in Settings: the name we greet you
        by, height, birth date, sex, activity level, timezone, units, weigh-ins you enter manually,
        and your nutrition goals. These are used to calculate calorie and protein targets.
      </p>
      <p>
        <strong>Training data from Hevy.</strong> Using the API key you provide, we copy your
        workouts, sets, exercises and body measurements from Hevy so we can chart them.
      </p>
      <p>
        <strong>Nutrition data.</strong> Meals you log through the Telegram bot or the dashboard,
        including the text you send, the estimated foods, amounts and nutrients, and foods you save.{" "}
        <strong>Meal photos are processed in memory only and never stored.</strong>
      </p>
      <p>
        <strong>Health data.</strong> If you connect Apple Health through the Health Auto Export
        app, the metrics it sends, such as steps, active and resting energy, and body weight.
      </p>
      <p>
        <strong>Telegram.</strong> If you link the bot, your Telegram chat ID, user ID and username,
        plus a short rolling history of recent bot messages (roughly the last 20 exchanges from the
        past 48 hours) so the bot can follow a conversation.
      </p>
      <p>
        <strong>Credentials for other services.</strong> Your Hevy and AI provider API keys, which
        are encrypted (AES-256-GCM) before storage and are never shown back to you in full.
      </p>
      <p>
        <strong>Technical data.</strong> Records of AI requests made for you (the model used, which
        tools ran and with what inputs, token counts, timing and errors), sync status, and standard
        server logs such as IP addresses and request times kept by our hosting providers.
      </p>
      <p>
        Health, fitness and nutrition information can be sensitive. You decide what to connect, and
        everything except Hevy is optional.
      </p>

      <h2>2. How we use it</h2>
      <ul>
        <li>To run the service: sync, store and chart your data, and answer your bot requests.</li>
        <li>
          To authenticate you and send account emails such as confirmation and password resets.
        </li>
        <li>To keep the service secure, debug problems and prevent abuse.</li>
      </ul>
      <p>
        We don't sell or rent your data, show you ads, or use your data to train AI models. We don't
        send marketing email.
      </p>

      <h2>3. Who we share it with</h2>
      <p>We share data only with the services needed to run LiftLedger:</p>
      <ul>
        <li>
          <strong>Supabase</strong> provides our database and authentication, and sends account
          emails. Data is hosted in Canada.
        </li>
        <li>
          <strong>Vercel</strong> hosts the website and API.
        </li>
        <li>
          <strong>Your AI provider.</strong> When you use the bot, your messages, meal photos and
          the relevant parts of your data needed to answer are sent to the AI provider you
          configured (for example OpenAI, Anthropic or your own server) under your API key. Their
          handling is governed by their privacy policy and your agreement with them.
        </li>
        <li>
          <strong>Telegram</strong> carries messages between you and the bot.
        </li>
        <li>
          <strong>Hevy</strong> receives requests made with your API key to fetch your workouts.
        </li>
        <li>
          <strong>USDA FoodData Central and Open Food Facts</strong> receive food search terms (like
          "black beans") to look up nutrients. No information that identifies you is included.
        </li>
      </ul>
      <p>
        We may also disclose data if required by law, or to protect the rights, safety or security
        of our users or the service.
      </p>

      <h2>4. How long we keep it</h2>
      <p>
        We keep your data while your account is open. Bot conversation history rolls off after about
        48 hours. When you delete your account, your profile, synced data, meals, credentials and
        links are deleted. Copies in backups are removed as those backups expire.
      </p>

      <h2>5. Your choices and rights</h2>
      <ul>
        <li>View and edit your profile and goals in Settings.</li>
        <li>Unlink Telegram or disconnect Apple Health or your AI provider at any time.</li>
        <li>
          Ask us for a copy of your data, to correct it, or to delete your account and everything
          linked to it.
        </li>
      </ul>
      <p>
        Depending on where you live, you may have additional rights under laws such as the GDPR, UK
        GDPR, PIPEDA or US state privacy laws, including the right to object to or restrict
        processing and to complain to a data protection authority. We'll honor these requests
        wherever they apply.
      </p>

      <h2>6. Security</h2>
      <p>
        Data is encrypted in transit. Database access is restricted per user with row-level
        security, and third-party API keys are encrypted at rest. No system is perfectly secure, so
        use a strong, unique password.
      </p>

      <h2>7. Children</h2>
      <p>
        LiftLedger isn't meant for anyone under 16, and we don't knowingly collect their data. If
        you believe a child has created an account, contact us and we'll delete it.
      </p>

      <h2>8. Changes</h2>
      <p>
        If we change this policy, we'll update the date at the top. We'll tell you in the app or by
        email before a material change takes effect. See also our{" "}
        <Link to="/terms">Terms of Service</Link>.
      </p>

      <h2>9. Contact</h2>
      <p>
        For privacy questions or requests, reach us through{" "}
        <a href={CONTACT_URL}>the LiftLedger project page</a>. Please don't post personal or health
        information publicly there. Ask for a private channel and we'll follow up.
      </p>
    </LegalLayout>
  );
}
