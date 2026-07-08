import { LinkButton } from "@cloudflare/kumo"

function NotFound() {
    return (
        <div className="min-h-dvh flex flex-col justify-center items-center gap-4">
            <span className="text-9xl font-bold">404</span>
            <p className="text-3xl font-bold">Page Not Found</p>
            <LinkButton href="/" variant="ghost" size="lg">
                Go Home
            </LinkButton>
        </div>
    );
}

export default NotFound;