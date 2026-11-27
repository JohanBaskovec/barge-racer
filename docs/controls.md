# Controls

The game is played with **one pointer only**: a mouse on desktop or one finger
on a touch screen. Keyboard and gamepad are optional extras for later and are
never required.

## Steering: "point where you want to go"

While the pointer is **held down** (left mouse button, or a finger on the
screen), the boat drives towards it.

```
              pointer
                 x
                /
               /  distance d  ->  throttle
              /
          [boat]  -- heading turns towards the pointer
```

- **Direction**: the vector from the player's boat (in screen space) to the
  pointer is the *desired heading*. The boat turns towards it at the turn rate
  allowed by its `handling` stat; it does not snap.
- **Throttle**: the distance `d` between boat and pointer, in screen pixels,
  sets the throttle:
  - `d < deadZone` (40 px at 1x scale): throttle 0, heading held. This lets you
    hold your finger on the boat to coast without turning.
  - `d >= fullThrottleDistance` (180 px): throttle 1.
  - In between: linear from 0 to 1.
  Distances are in CSS pixels and scaled with the game's zoom so they feel the
  same on phones and monitors.
- **Pointer released**: throttle 0, the boat coasts and slows down from water
  drag. There is no brake; turning hard and releasing slows you down quickly
  enough.
- **Reverse**: pointing behind the boat (more than 120 degrees from the
  heading) while it is almost stopped (< 20 % of top speed) makes it reverse
  slowly. This is how you get off a bank you drove into head-first.

Because the camera follows the boat, the boat always stays near the same spot
on screen. Holding the finger still in one place therefore acts like a virtual
joystick around the boat: hold above-right of the boat and it keeps turning
until it heads up-right on screen.

### Optional mode: "on release"

Option for players who don't like holding the button: **Tap to set a target**.
A tap places a target marker in the world; the boat drives towards it at full
throttle until it gets within 60 px, then coasts. A new tap moves the marker.
Off by default.

## Using items

| Input | Action |
| --- | --- |
| **Right mouse button**, anywhere | Fire the **first** item (works while the left button is held for steering) |
| **Middle mouse button**, anywhere | Fire the **second** item |
| Tap the item buttons (bottom right, numbered 1 and 2) | Fire that item forwards |
| Second finger tap, anywhere (multi-touch) | Fire the first item |
| Swipe down on an item button | Fire that item **backwards** (Volunteers, Drill, Silicone Gun, see below) |
| `Space` / `E` | Fire the first / second item; hold `Shift` to fire backwards |

- You hold **two items**. A new item goes into the first free slot. Each button
  shows its item's picture and its **name underneath** (and `x2`/`x3` for
  multi-use items).
- Right and middle click work even when the pointer is over an item button.
- The item buttons are large (about 116 px across in the 1280 x 720 game), out
  of the area where the steering finger usually is, and are meant to be placed
  bottom left in left-handed mode.
- A pointer down that starts on the item slot or on a HUD button is **never**
  treated as steering.
- Backwards fire: Volunteers are thrown backwards in a straight line (no homing),
  and the Drill and the Silicone Gun are fired backwards. Glue and Fake Crates are
  always dropped behind; swiping makes no difference for them, nor for Jigsaw,
  White Powder and Mushrooms.

## Fullscreen on phones and tablets

- **Android (Chrome, Firefox):** the first tap on the title screen enters
  fullscreen and asks for landscape. There is also a fullscreen button on the
  title screen and next to the pause button during a race.
- **iPhone Safari:** browsers on iPhone don't allow fullscreen for web pages
  (iPad does). Use **Share, Add to Home Screen**: the game then opens full
  screen with no browser bars, using `public/manifest.webmanifest` and the
  `apple-mobile-web-app-*` tags in `index.html`.
- In portrait a "please rotate your device" overlay covers the game.

## Menus

- Every menu works with taps and clicks only. Buttons have hover states on
  desktop and pressed states on touch.
- Boat and track carousels can be swiped or browsed with arrow buttons.
- `Esc` (desktop) or the pause button (top centre) opens the pause menu.

## Implementation notes

- Use Phaser's pointer input with `this.input.addPointer(1)` so that a second
  finger is tracked for the multi-touch fire.
- Disable the browser context menu on the canvas
  (`this.input.mouse.disableContextMenu()`) so right-click can fire.
- Prevent page scrolling, pinch zoom and pull-to-refresh on the canvas
  (`touch-action: none` and a proper viewport meta tag).
- Convert the pointer to the boat's position in **screen** space, not world
  space, so steering keeps working while the camera moves.
- The input layer produces a plain `ControlIntent` object each frame:

  ```ts
  interface ControlIntent {
    desiredHeading: number | null; // radians, null = keep current heading
    throttle: number;              // 0..1, negative for reverse
    fire: 'none' | 'forward' | 'backward';
  }
  ```

  The AI produces the same object (see [AI](ai.md)), so player boats and AI
  boats run through exactly the same physics code.

## Accessibility

- **Auto-fire** (option): fires a held item automatically when the AI's own
  targeting logic would (a good target in range). You can still fire by hand.
- **Left-handed** (option): the item buttons move to the bottom left.
- **Reduced screen shake** option (also turns off hit pauses).
- No steering assist, by design.
- All important information uses shapes and text as well as colour.
