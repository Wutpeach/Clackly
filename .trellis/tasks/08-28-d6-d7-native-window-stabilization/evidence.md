# Evidence and Retrospective

## Manual acceptance

The standalone Windows D6 main Palette passed repeated reveal cycles with immediate stable visibility, native rounded corners, and native shadow. D7 established a separate native Panel window with a real 16px gap; it remains nonfocusable and the main retains selection/focus authority.

## Root cause and prevention

The temporary D7 trace showed the renderer issuing an Interaction Panel close immediately after `palette:shown`. The Panel had no open state, yet the old close route still changed native Panel state and focused the main. Windows later delivered a queued native focus-loss event; the generic visible/opacity guard concealed the Palette even though it had regained focus.

The accepted prevention contract is:

- no detached-open state means close is a native no-op;
- Panel focusability is constructor-only and no open/update/close route invokes `setFocusable`;
- only D7 ignores a native blur when `isFocused()` is already true; a genuine unfocused blur still hides;
- immediate opacity changes are stability state, never requested motion design.

The recorder/analyzer is intentionally retired after this evidence capture.
