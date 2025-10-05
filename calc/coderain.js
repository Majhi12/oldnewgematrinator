// Enhanced Matrix code rain with faint mode + toggle
(function(){
	const canvas = document.getElementById('canv');
	if(!canvas) return;
	const ctx = canvas.getContext('2d');
	function resize(){
		canvas.width = document.body.offsetWidth;
		canvas.height = window.innerHeight;
	}
	window.addEventListener('resize', resize); resize();

	const COL_WIDTH = 16; // tighter columns for nicer density
	let cols = Math.floor(canvas.width / COL_WIDTH) + 1;
	let ypos = Array(cols).fill(0);

	let interval = null;
	let active = false;
	let faint = true; // default faint
	function recollect(){ cols = Math.floor(canvas.width / COL_WIDTH) + 1; ypos = Array(cols).fill(0); }
	window.addEventListener('resize', recollect);

	function frame(){
		// trailing fade (faint uses more aggressive alpha to disappear quicker)
		ctx.fillStyle = faint ? 'rgba(10,15,13,0.20)' : 'rgba(10,15,13,0.10)';
		ctx.fillRect(0,0,canvas.width,canvas.height);
		ctx.fillStyle = faint ? 'rgba(82,255,168,0.35)' : '#52ffa8';
		ctx.font = '14px JetBrains Mono, monospace';
		ypos.forEach((y,i)=>{
			const ch = String.fromCharCode(0x30A0 + Math.random()*96);
			ctx.fillText(ch, i*COL_WIDTH, y);
			ypos[i] = y > canvas.height + Math.random()*800 ? 0 : y + (faint ? 18 : 20);
		});
	}

	function start(){ if(active) return; active = true; canvas.style.display='block'; interval = setInterval(frame, 55); }
	function stop(){ if(!active) return; clearInterval(interval); active=false; ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; }
	function setFaint(v){ faint = !!v; }

	// Expose global controls
	window.MatrixRain = {
		start, stop, setFaint,
		toggle(){ active ? stop() : start(); },
		faint(){ setFaint(true); },
		vivid(){ setFaint(false); },
		state(){ return { active, faint }; }
	};

	// Integrate with legacy option flags if present
	if(typeof opt_MatrixCodeRain !== 'undefined') {
		if(opt_MatrixCodeRain) start(); else stop();
	} else {
		// default start faint
		start();
	}
})();

// Helper for menu link
function ToggleMatrixRain(){
	if(!window.MatrixRain) return;
	const st = window.MatrixRain.state();
	if(!st.active){ window.MatrixRain.start(); return; }
	// cycle: faint -> vivid -> off -> faint
	if(st.faint){ window.MatrixRain.vivid(); }
	else if(!st.faint){ window.MatrixRain.stop(); }
	else { window.MatrixRain.faint(); }
}

// Provide legacy function name expected elsewhere
function toggle_code_rain(){ ToggleMatrixRain(); }