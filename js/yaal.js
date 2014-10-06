/**
    YAAL: Yet Another Animation Library
    by Mark Napier (marknapier.com)
    Quick and dirty animation libe can animate CSS numerical values 
    with units px, %, and colors.  Is handy for looping and oscillating 
    sequences.  Completely JQuery free.  Can easily call a function 
    instead of doing CSS operations, so can be used in non-CSS situations
    like animating canvas elements and WebGL.

    Tested in Chrome Version 37.0, IE 11.  
    It's not happy in Firefox 31.0 (CSS does not update correctly).

    Example:

    var secondAnimation = YAAL.animate(1000)
        .move(someFunction, "swing")
        .loop();  // keep repeating

    var finstAnimation = new YAAL.Animation(2000)
        .move("#tween1", {width:{from:"10%",to:"80%",ease:"linear"}, "background-color":{to:"#ff0000",ease:"speedup"}})
        .move("#tween2", {width:{to:"400",ease:"speedup"}})
        .then( secondAnimation );

    function someFunction(percent) {
        // do something with percent
    }

    firstanimation.play();
*/


/**
 *  YAAL module contains:
 *      Animation - plays, stops and "ticks" an animation
 *      Tweener - has the easing functions
 *      Ticker - handles the setInterval() timer
 *      Util - misc. CSS helper functions
 */
var YAAL = (function () {

    /** 
     *  Convenience function
     */
    function animate( duration, loop ) {
        return new Animation( duration, loop );
    }


    /** 
     *  Animation prepares and runs an animation.  
     *  Call .move() to add targets to the animation (ie. CSS changes or functions)
     *  Call .play() to start
     *  .tick() does the animation work (called internally by Ticker)
     */
    var Animation = function (duration, cycle) {
        this.duration = duration || 1000;
        this.start_time = null;
        this.cycle = cycle || false;
        this._oscillate = false;
        this.up = true;
        this.targets = [];
        this.id = 0;
        this.playing = false;
        this.firstfunc;
        this.thenfunc;
    };
    Animation.timer = null;
    Animation.animations = [];
    Animation.tick = function () {
        for (var i=0; i < Animation.animations.length; i++) {
            if (Animation.animations[i]) {
                Animation.animations[i].tick();
            }
        }
    }
    Animation.prototype = {
        constructor: Animation,

        /**
         *  Add a target to this Animation, either CSS elements to update, or a function to call.
         *  When the animation "ticks" it will update all the items in targets[].
         */
        move: function (target, props) {
            if (typeof target === "function") {
                // Target is a function, props is the name of an easing style
                this.targets.push({
                    action: this.actionRun,
                    func: target,
                    easefunc: Tweener.easings[props]
                });
            }
            else {
                // Target is a CSS selector, props holds CSS settings
                // The "to" property is required.  Units are parsed from the "to" value.
                // If not provided, "from" will be read from the html element when the animation runs.
                for (var propname in props) {
                    var from = props[propname]["from"] || null;
                    props[propname]["units"] = Util.getCSSunits(props[propname]["to"]) || "px";
                    props[propname]["to"]    = Util.getCSSval(props[propname]["to"]);
                    props[propname]["from"]  = from? Util.getCSSval(from) : null;
                    props[propname]["ease"]  = Tweener.easings[ props[propname]["ease"] || "linear" ];
                }
                this.targets.push({
                    action: this.actionCSS,
                    elements: Util.getElement(target),
                    properties: props
                });
            }
            return this;
        },

        /**
         *  Animation will repeat indefinitely.
         */
        loop: function () {
            this.cycle = true;
            return this;
        },

        /**
         *  Animation will repeat in reverse.
         */
        oscillate: function () {
            this._oscillate = this.cycle = true;
            return this;
        },

        /**
         *  Designate a function to call when animation starts.
         */
        first: function ( f ) {
            this.firstfunc = f;
            return this;
        },

        /**
         *  Designate a function to call when animation stops.
         */
        then: function ( f ) {
            this.thenfunc = f;
            return this;
        },

        /**
         *  Add Animation to queue
         */
        play: function () {
            if (!Animation.timer) {
                Animation.timer = Ticker.start(function(){Animation.tick()},15);
            }
            if (this.firstfunc) {
                if (typeof this.firstfunc === "function") {
                    this.firstfunc();
                }
                else {
                    // assume it's another Animation
                    this.firstfunc.play();
                }
            }
            this.playing = true;
            this.up = true;
            this.start_time = Util.currentTime();
            this.id = Animation.animations.push(this) -1;
            console.log("started anim id=" + this.id);
            return this;
        },

        /**
         *  Remove Animation from queue
         */
        stop: function () {
            this.playing = false;
            // quick hack to stop animation (better: remove animation from queue)
            Animation.animations[this.id] = null;
            console.log("stopped anim id=" + this.id + " then=" + this.thenfunc);
            // run what's next 
            if (this.thenfunc) {
                if (typeof this.thenfunc === "function") {
                    this.thenfunc();
                }
                else {
                    // assume it's another Animation
                    this.thenfunc.play();
                }
            }
            return this;
        },

        /**
         *  Advance animation one step.  Called by class method Animation.tick()
         */
        tick: function () {
            if (this.playing) {
                var duration = this.duration;
                var deltaT = Util.currentTime() - this.start_time;
                var elapsed = deltaT / duration;  // a number from 0 to 1
                // at end of animation
                if (deltaT >= duration) {
                    if (this.cycle) {
                        if (this._oscillate) {
                            this.up = !this.up;  
                        }
                        elapsed = 0; 
                        this.start_time = Util.currentTime();
                    }
                    else {
                        this.stop();
                    }
                }
                // run backwards
                if (this.cycle && !this.up) {
                    elapsed = 1-elapsed;
                }
                // run all target functions 
                for (var i=0; i < this.targets.length; i++) {
                    this.targets[i].action.call(this, elapsed, this.targets[i]);
                }
            }
        },

        /**
         *  Run a target function. Pass percent elapsed.
         */
        actionRun: function (p, target) {
            if (this.playing) {
                target.func( target.easefunc(p) );
            }
        },

        /**
         *  Change CSS properties on target element(s). 
         *  Params: percent elapsed, target object.
         */
        actionCSS: function (p, target) {
            if (this.playing) {
                var elems = target.elements;
                var props = target.properties;
                // foreach element
                for (var e=0; e < elems.length; e++) {
                    // update each property
                    for (var propname in props) {
                        var prop = props[propname];
                        // if From value is not specified, use the current value
                        if (prop.from===null) {
                            prop.from = Util.getCSSdetails(elems[e],propname).value;
                        }
                        // set the CSS value
                        if (prop.units === "#") {
                            // color value
                            var v = prop.ease(p);
                            elems[e].style[propname] = Util.rgbToHex(
                                    (prop.to[0] - prop.from[0]) * v + prop.from[0],    // red
                                    (prop.to[1] - prop.from[1]) * v + prop.from[1],    // green
                                    (prop.to[2] - prop.from[2]) * v + prop.from[2]  ); // blue
                        }
                        else {
                            // pixel or percent
                            elems[e].style[propname] = (prop.to - prop.from) * prop.ease(p) + prop.from + prop.units;                        
                        }
                    }
                }
            }
        }
    };


    /**
     *  Tweener holds the easing functions.  
     */
    var Tweener = (function () {
        return {
            easings: {
                linear: function(p) {
                    return p;
                },
                swing: function(p) {
                    return 0.5 - Math.cos( p*Math.PI ) / 2;
                },
                sin: function (p) {
                    return Math.sin(p*Math.PI);
                },
                speedup: function(p) {
                    return Math.pow(p, 4); 
                },
                slowdown: function(p) {
                    return 1 - Math.pow(1-p, 4); 
                },
                elastic: function(p) {
                    var bounces = 5;
                    p = Tweener.easings.swing(p);
                    return ((1-Math.cos(p * Math.PI * bounces)) * (1 - p)) + p; 
                },
                bounce: function(p) {
                    p = Tweener.easings.elastic(p); 
                    return p <= 1 ? p : 2-p;
                },
                easeOutBounce: function(p) {
                    return Tweener.easings.easeOutBounce_(0, p, 0, 1, 1);
                },
                // t: current time, b: begInnIng value, c: change In value, d: duration
                easeOutBounce_: function(x, t, b, c, d) {
                    if ((t/=d) < (1/2.75)) {
                        return c*(7.5625*t*t) + b;
                    } else if (t < (2/2.75)) {
                        return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
                    } else if (t < (2.5/2.75)) {
                        return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
                    } else {
                        return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
                    }
                }
            },

            // not used (tween math is now in Animation.actionCSS())
            tween: function(start, end, percent, easing) {
                var pos = Tweener.easings[easing]( percent );
                return (end - start) * pos + start;
            }
        };
    }());


    /**
     *  Ticker manages the setInterval timer
     */
    var Ticker = (function () {
        var timer_id = null;
        return {
            getId: function() {
                return timer_id;
            },
            start: function(f,interval) {
                timer_id = setInterval(f, interval);
                return this;
            },
            stop: function() {
                clearInterval(timer_id);
            }
        };
    }());


    /**
     *  Util holds misc. handy functions, mostly for CSS
     */
    var Util = (function () {
        return {
            round3: function(f) {
                return (Math.round(f*1000)/1000);
            },
            getElement: function(selector) {
                if (!selector) {
                    return [];
                }
                var ch = selector.charAt(0);
                if (ch === "#") return [document.getElementById(selector.substring(1))];
                else if (ch === ".") return document.getElementsByClassName(selector.substring(1));
                else return document.getElementsByTagName(selector);
            },
            currentTime: function() {
                return (new Date()).getTime();
            },
            rgbToHex: function(r, g, b) {
                return "#" 
                    + ( (1 << 24) 
                    + (Math.floor(r) << 16) 
                    + (Math.floor(g) << 8) 
                    + (Math.floor(b)) )
                    .toString(16).slice(1);
            },
            hexToRgb: function(hex) {
                if (hex.charAt(0) === "#") hex = hex.substring(1);
                var bigint = parseInt(hex, 16);
                var r = (bigint >> 16) & 255;
                var g = (bigint >> 8) & 255;
                var b = bigint & 255;
                return [r, g, b];
            },
            RGBToRGB: function(RGB_string) {
                m = RGB_string.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
                if (m) {
                    return [ parseInt(m[1]), parseInt(m[2]), parseInt(m[3]) ];
                }
            },
            getCSSval: function(CSSvaluestring) {
                if (CSSvaluestring.charAt(0) === "#") {
                    return this.hexToRgb(CSSvaluestring);
                }
                else if (CSSvaluestring.lastIndexOf("rgb",0) === 0) {
                    return this.RGBToRGB(CSSvaluestring);
                }
                return parseFloat(CSSvaluestring);
            },
            getCSSunits: function(CSSvaluestring /* , e, p*/) {
                // console.log("getUnits prop=" + p + " val=" + CSSvaluestring + " units=" + CSSvaluestring.replace(/[-\d\.]/g, ''));
                // console.log(e.style);
                if (CSSvaluestring.charAt(0) === "#") {
                    return "#";
                }
                return CSSvaluestring.replace(/[-\d\.]/g, '');
            },
            getCSSstyle: function(elem, css_property) {
                //getStyle(document.getElementById("container"), "border-radius");
                var strval = "";
                if(window.getComputedStyle){
                    try { strval = getComputedStyle(elem).getPropertyValue(css_property) }
                    catch (e) { console.log("Could not getCSSstyle for property " + css_property + " on element " + elem)}
                }
                else if (elem.currentStyle) {   //IE
                    try { strval = elem.currentStyle[css_property]; } 
                    catch (e) {}
                }
                //console.log("getStyle return: " + strval);
                return strval;
            },
            getCSSdetails: function(elem, css_property) {
                var cssval = Util.getCSSstyle(elem,css_property);
                return {
                    "css_value": cssval,
                    "value": Util.getCSSval(cssval),
                    "units": Util.getCSSunits(cssval)
                };
            }
        };
    }());


    var my = {};

    // PUBLIC exposure
    my.Animation = Animation;
    my.Tweener = Tweener;
    my.Ticker = Ticker;
    my.Util = Util;
    my.animate = animate;

    return my;
}());
