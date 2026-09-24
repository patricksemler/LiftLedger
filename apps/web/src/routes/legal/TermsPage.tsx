import { Link } from "react-router";
import { CONTACT_URL, LegalLayout } from "./LegalLayout";

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These terms govern your use of LiftLedger (the "service"), a dashboard that brings your
        workouts, meals and health data together. By creating an account or using the service you
        agree to these terms and to our <Link to="/privacy">Privacy Policy</Link>. If you don't
        agree, don't use LiftLedger.
      </p>

      <h2>1. Who can use LiftLedger</h2>
      <p>
        You must be at least 16 years old and able to form a binding agreement. You may only create
        an account for yourself.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Sign up with an email address you control. We'll ask you to confirm it.</li>
        <li>
          Keep your password secret. You're responsible for everything that happens under your
          account until you tell us it's been compromised.
        </li>
        <li>
          Keep the credentials you give us for other services (like your Hevy or AI provider API
          keys) valid and yours to use.
        </li>
      </ul>

      <h2>3. Connected services</h2>
      <p>
        LiftLedger works with services we don't run, including Hevy, Telegram, Apple Health (through
        the Health Auto Export app) and an AI provider you choose. Your use of each is governed by
        that service's own terms. You're responsible for any fees they charge. In particular, AI
        requests made with your own API key are billed to you by your provider. We aren't
        responsible for those services' availability, accuracy or conduct.
      </p>

      <h2>4. Not medical or nutrition advice</h2>
      <p>
        LiftLedger is an informational tracking tool. Calorie, macro and nutrient values are
        estimates. They come from AI parsing, public food databases and your own input, and{" "}
        <strong>they can be wrong</strong>. Calorie targets, goal presets, training summaries and
        answers from the bot are not medical, dietary or fitness advice. Talk to a qualified
        professional before making significant changes to your diet or training, especially if you
        have a medical condition, are pregnant, or have a history of disordered eating.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          access or try to access another person's data, or probe, scan or test the service's
          security without permission;
        </li>
        <li>
          overload, disrupt or reverse-engineer the service beyond what applicable law allows, or
          use automated means to create accounts or send traffic;
        </li>
        <li>use the service, including the Telegram bot, to send unlawful or abusive content;</li>
        <li>resell or provide the service to others without our written permission.</li>
      </ul>

      <h2>6. Your data</h2>
      <p>
        You own the data you put into LiftLedger or connect to it. You give us permission to store,
        process and transmit it only as needed to run the service for you, as described in the{" "}
        <Link to="/privacy">Privacy Policy</Link>. We don't sell your data or use it for
        advertising.
      </p>

      <h2>7. Changes and availability</h2>
      <p>
        LiftLedger is provided free of charge. We may change, suspend or discontinue any part of it
        at any time. We'll try to give reasonable notice of changes that materially affect you, but
        we don't guarantee that the service will be available, uninterrupted or error-free. Keep
        your own records of anything you can't afford to lose. Your workouts remain in Hevy and your
        health data remains in Apple Health.
      </p>

      <h2>8. Disclaimer of warranties</h2>
      <p>
        The service is provided <strong>"as is" and "as available"</strong>, without warranties of
        any kind, express or implied, including merchantability, fitness for a particular purpose,
        accuracy and non-infringement, to the fullest extent permitted by law.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, LiftLedger and the people who run it won't be liable
        for any indirect, incidental, special, consequential or punitive damages, or for any loss of
        data, health outcomes, profits or goodwill, arising from your use of or inability to use the
        service. Our total liability for any claim relating to the service is limited to the amount
        you paid us for it in the twelve months before the claim, which for a free service is zero.
        Some jurisdictions don't allow these limits, so they may not fully apply to you.
      </p>

      <h2>10. Ending your use</h2>
      <p>
        You can stop using LiftLedger at any time and ask us to delete your account. We may suspend
        or close accounts that break these terms or put the service or other users at risk. Sections
        4, 6, 8 and 9 survive after your account is closed.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top shows the latest version. If a change is
        material, we'll let you know in the app or by email before it takes effect. Continuing to
        use LiftLedger after that means you accept the new terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms? Reach us through{" "}
        <a href={CONTACT_URL}>the LiftLedger project page</a>.
      </p>
    </LegalLayout>
  );
}
