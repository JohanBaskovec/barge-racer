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
| Tap / click the **item slot** button (bottom right) | Fire the held item forwards |
| Right mouse button, anywhere | Fire the held item (desktop shortcut) |
| Second finger tap, anywhere (multi-touch) | Fire the held item |
| Swipe down on the item slot | Fire **backwards** (Volunteers, Drill and Glue, see below) |

- The item slot button is at least 88 x 88 CSS px, out of the area where the
  steering finger usually is, and is placed bottom left in left-handed mode.
- A pointer down that starts on the item slot or on a HUD button is **never**
  treated as steering.
- Backwards fire: Volunteers are thrown backwards in a straight line (no homing),
  the Drill is fired backwards, and Glue is always dropped behind; swiping makes
  no difference for Jigsaw and White Powder.
- On desktop, `Space` fires and `Shift + Space` fires backwards, as optional
  shortcuts.

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

- **Steering assist** (option, on by default on Pond difficulty): gently pulls
  the desired heading towards the track direction and keeps the boat off the
  banks.
- **Auto-fire** (option): fires an item automatically when the AI targeting
  logic would (good target in range).
- **Reduced screen shake** option.
- All important information uses shapes and text as well as colour.
