// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MARK_AMBER, MARK_PATH } from "@/components/brand/steelBuildMarkGeometry";
import Landing from "@/pages/Landing";

afterEach(cleanup);
const callbacks = () => ({ onLogin: vi.fn().mockResolvedValue(undefined), onSignUp: vi.fn().mockResolvedValue({success:true,needsConfirmation:true}), onForgotPassword: vi.fn().mockResolvedValue({success:true}), isSubmitting:false, loginError:null as string | null });

describe("public marketing account entry", () => {
  it("uses the approved marketing badge and preserves the app brand inside sign-in", () => {
    render(<Landing {...callbacks()}/>);
    expect(screen.getAllByAltText("SteelBuild Pro steel diamond badge")[0]).toHaveAttribute("src", "/marketing/steelbuild-pro-logo.jpg");
    fireEvent.click(screen.getAllByRole("button", {name:"Log in"})[0]);
    const mark=within(screen.getByRole("dialog")).getByRole("img", {name:"SteelBuild-Pro"}).querySelector("path");
    expect(mark).toHaveAttribute("d", MARK_PATH);
    expect(mark).toHaveAttribute("fill", `var(--brand-amber, ${MARK_AMBER})`);
  });
  it("opens sign-in from the header and passes the credentials to the existing handler", async () => {
    const props=callbacks(); render(<Landing {...props}/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Log in"})[0]);
    const dialog=screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Email"),{target:{value:"crew@example.com"}});
    fireEvent.change(within(dialog).getByLabelText("Password"),{target:{value:"example-password"}});
    fireEvent.click(within(dialog).getByRole("button",{name:"Sign in"}));
    expect(props.onLogin).toHaveBeenCalledWith({email:"crew@example.com",password:"example-password"});
    fireEvent.keyDown(window,{key:"Escape"}); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens signup from Start free and retains terms consent and email confirmation", async () => {
    const props=callbacks(); render(<Landing {...props}/>);
    fireEvent.click(screen.getAllByRole("button",{name:/Start free/})[0]);
    const dialog=screen.getByRole("dialog");
    expect(within(dialog).getByRole("button",{name:"Create account"})).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Full name"),{target:{value:"Test Crew"}});
    fireEvent.change(within(dialog).getByLabelText("Email"),{target:{value:"crew@example.com"}});
    fireEvent.change(within(dialog).getByLabelText("Password"),{target:{value:"example-password"}});
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button",{name:"Create account"}));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(props.onSignUp).toHaveBeenCalledWith({email:"crew@example.com",password:"example-password",fullName:"Test Crew",termsAccepted:true});
  });
  it("keeps password reset neutral and clears its notice on a fresh signup", async () => {
    const props=callbacks(); render(<Landing {...props}/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Log in"})[0]);
    fireEvent.click(screen.getByRole("button",{name:"Forgot password?"}));
    fireEvent.change(screen.getByLabelText("Email"),{target:{value:"crew@example.com"}});
    fireEvent.click(screen.getByRole("button",{name:"Send reset link"}));
    expect(await screen.findByText(/If an account exists/)).toBeInTheDocument();
    expect(props.onForgotPassword).toHaveBeenCalledWith("crew@example.com");
    fireEvent.click(screen.getByRole("button",{name:"Close sign in"}));
    fireEvent.click(screen.getAllByRole("button",{name:/Start free/})[0]);
    expect(screen.getByRole("heading",{name:"Create your account"})).toBeInTheDocument();
  });
  it("changes product previews and shows catalog prices", () => {
    render(<Landing {...callbacks()}/>);
    fireEvent.click(screen.getByRole("button",{name:/Drawing control/}));
    expect(screen.getByRole("heading",{name:"Keep the next approval moving."})).toBeInTheDocument();
    expect(screen.getByText("$99")).toBeInTheDocument(); expect(screen.getByText("$299")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Security"})).toHaveAttribute("href","/Security");
  });
});
