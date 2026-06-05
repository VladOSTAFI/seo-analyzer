import { Container } from "@/components/primitives/container";

/**
 * Centered shell for the auth route group (`/login`, `/register`). The global
 * nav + footer still wrap these (they live in the root layout); this just
 * vertically centers the card within the page body.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center py-16 md:py-24">
      <Container>
        <div className="mx-auto w-full max-w-md">{children}</div>
      </Container>
    </div>
  );
}
