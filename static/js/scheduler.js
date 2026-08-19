// Initialize date picker with minimum date of tomorrow
// API Base URL - deployed at meet.mike.game/api
const API_BASE_URL = 'https://meet.mike.game';
console.log('🚀 API_BASE_URL set to:', API_BASE_URL);

document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('appointmentDate');
    const timezoneSelect = document.getElementById('timezone');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const companyInput = document.getElementById('company');
    const roleInput = document.getElementById('role');
    const bookButton = document.getElementById('bookButton');
    const confirmationMessage = document.getElementById('confirmationMessage');
    const errorMessage = document.getElementById('errorMessage');
    const meetingTypesContainer = document.getElementById('meetingTypes');
    const meetingTypeHint = document.getElementById('meetingTypeHint');
    const step2Section = document.getElementById('step2Section');
    const step3Section = document.getElementById('step3Section');
    const step4Section = document.getElementById('step4Section');
    const discussionDetails = document.getElementById('discussionDetails');
    const emailError = document.getElementById('emailError');
    const use24HourCheckbox = document.getElementById('use24HourFormat');
    const use24HourMeetingTypeCheckbox = document.getElementById('use24HourFormatMeetingType');

    let selectedTime = null;
    let selectedMeetingType = null;
    let flatpickrInstance = null;

    const meetingTypes = [
        {
            id: 'gamescom-chat',
            title: "Gamescom: Let's Chat!",
            description: "Catch up or talk through what's on your mind.",
            durationMinutes: 25,
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '09:30',
            dailyEnd: '17:30',
        },
        {
            id: 'gamescom-lunch',
            title: "Gamescom: Let's Grab Lunch!",
            description: 'One lunch a day.',
            durationMinutes: 50,
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '12:00',
            dailyEnd: '12:00',
        },
        {
            id: 'gamescom-dinner',
            title: 'Gamescom: Dinner & Drinks',
            description: 'Dinner and drinks. One per evening.',
            durationMinutes: 90,
            dateStart: '2026-08-22',
            dateEnd: '2026-08-28',
            dailyStart: '18:30',
            dailyEnd: '19:30',
        },
        {
            id: 'gamescom-coffee',
            title: 'Gamescom: Rise & Shine',
            description: 'Coffee or breakfast to start the day. One per day.',
            durationMinutes: 30,
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '09:00',
            dailyEnd: '09:00',
        },
        {
            id: 'gamescom-extended',
            title: '🎮 Gamescom: Extended Play',
            description: 'A full 50 minutes for deeper conversations.',
            durationMinutes: 50,
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '09:30',
            dailyEnd: '17:00',
            hidden: true,
        },
        {
            id: 'gamescom-hour',
            title: '🎮 Gamescom: The Full Hour',
            description: 'A full hour for the big conversations.',
            durationMinutes: 60,
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '09:30',
            dailyEnd: '17:00',
            hidden: true,
        },
    ];

    // ===== Access codes: unlock hidden meeting types =====
    // Stored codes are only honored while they exist in this map, so removing
    // or rotating a code re-locks its meeting type for everyone.
    const UNLOCK_CODES = {
        EXTRATIME: 'gamescom-extended',
        UNLOCKTIME: 'gamescom-hour',
    };

    let unlockedCodes = [];
    try {
        unlockedCodes = JSON.parse(localStorage.getItem('unlockedCodes') || '[]');
        if (!Array.isArray(unlockedCodes)) unlockedCodes = [];
        // Carry over the earlier single-code flag
        if (localStorage.getItem('extendedPlayUnlocked') === 'EXTRATIME' && !unlockedCodes.includes('EXTRATIME')) {
            unlockedCodes.push('EXTRATIME');
            localStorage.setItem('unlockedCodes', JSON.stringify(unlockedCodes));
        }
        localStorage.removeItem('extendedPlayUnlocked');
        localStorage.removeItem('gamescomCheat');
    } catch (e) { unlockedCodes = []; }
    unlockedCodes = unlockedCodes.filter(code => UNLOCK_CODES[code]);

    function unlockedTypeIds() {
        return unlockedCodes.map(code => UNLOCK_CODES[code]);
    }

    const unlockStyles = document.createElement('style');
    unlockStyles.textContent = [
        '@keyframes unlockGlow {',
        '  0%, 100% { box-shadow: 0 0 0 2px #f18900, 0 0 28px rgba(241, 137, 0, 0.85); }',
        '  50% { box-shadow: 0 0 0 2px #ff9101, 0 0 10px rgba(241, 137, 0, 0.35); }',
        '}',
        '.unlocked-card { animation: unlockGlow 1.1s ease-in-out 5; }'
    ].join('\n');
    document.head.appendChild(unlockStyles);

    function revealUnlockedType(typeId) {
        renderMeetingTypes();
        meetingTypeHint.textContent = 'Code accepted!';
        const unlockedCard = meetingTypesContainer.querySelector(`[data-meeting-type-id="${typeId}"]`);
        if (unlockedCard) {
            unlockedCard.classList.add('unlocked-card');
            setTimeout(function() {
                smoothScrollTo(unlockedCard, { block: 'center' });
            }, 250);
        }
    }

    const accessCodeSection = document.getElementById('accessCodeSection');
    const accessCodeInput = document.getElementById('accessCodeInput');
    const accessCodeBtn = document.getElementById('accessCodeBtn');
    const accessCodeFeedback = document.getElementById('accessCodeFeedback');

    function submitAccessCode() {
        const entered = (accessCodeInput.value || '').replace(/\s+/g, '').toUpperCase();
        if (!entered) return;
        const typeId = UNLOCK_CODES[entered];
        if (typeId) {
            accessCodeInput.value = '';
            accessCodeFeedback.style.display = 'none';
            if (!unlockedCodes.includes(entered)) {
                unlockedCodes.push(entered);
                try { localStorage.setItem('unlockedCodes', JSON.stringify(unlockedCodes)); } catch (e) {}
            }
            revealUnlockedType(typeId);
        } else {
            accessCodeFeedback.textContent = "That code didn't work. Double-check it and try again.";
            accessCodeFeedback.style.display = 'block';
            accessCodeInput.select();
        }
    }

    if (accessCodeInput && accessCodeBtn) {
        accessCodeBtn.addEventListener('click', submitAccessCode);
        accessCodeInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitAccessCode();
            }
        });
        accessCodeInput.addEventListener('input', function() {
            accessCodeFeedback.style.display = 'none';
        });
    }

    dateInput.disabled = true;

    // Always animate scrolling and pane transitions, even when the OS asks
    // for reduced motion; the animations are central to the booking flow.
    const prefersReducedMotion = false;

    // Eased programmatic scrolling (easeInOutCubic), offset for the fixed navbar.
    // The target position is recomputed every frame so the glide stays smooth
    // even while accordion panes above it are still expanding or collapsing.
    function smoothScrollTo(element, options = {}) {
        if (!element) return;
        const { block = 'start', offset = 80, duration } = options;

        function targetYNow() {
            const rect = element.getBoundingClientRect();
            let y = rect.top + window.pageYOffset - offset;
            if (block === 'center') {
                y = rect.top + window.pageYOffset - Math.max(0, (window.innerHeight - rect.height) / 2);
            }
            const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            return Math.min(Math.max(0, y), maxScroll);
        }

        // Bootstrap sets scroll-behavior: smooth on the page root, which would
        // turn every per-frame write into its own competing native animation.
        // Force each write to be instant so our easing is the only animation.
        function scrollNow(y) {
            try {
                window.scrollTo({ top: y, behavior: 'instant' });
            } catch (e) {
                window.scrollTo(0, y);
            }
        }

        if (prefersReducedMotion) {
            scrollNow(targetYNow());
            return;
        }

        const startY = window.pageYOffset;
        const initialDistance = Math.abs(targetYNow() - startY);
        const totalDuration = duration || Math.min(900, Math.max(500, initialDistance * 0.6));
        const startTime = performance.now();
        const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        function frame(now) {
            const progress = Math.min(1, (now - startTime) / totalDuration);
            scrollNow(startY + (targetYNow() - startY) * easeInOutCubic(progress));
            if (progress < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // Height-eased expand/collapse for accordion bodies
    function expandBody(body) {
        if (getComputedStyle(body).display !== 'none') return;
        if (body._animTimer) clearTimeout(body._animTimer);
        body.style.display = 'block';
        if (prefersReducedMotion) return;
        const height = body.scrollHeight;
        body.style.overflow = 'hidden';
        body.style.height = '0px';
        void body.offsetHeight; // reflow so the transition starts from 0
        body.style.transition = 'height 0.35s ease';
        body.style.height = height + 'px';
        body._animTimer = setTimeout(() => {
            body.style.height = '';
            body.style.overflow = '';
            body.style.transition = '';
            body._animTimer = null;
        }, 380);
    }

    function collapseBody(body) {
        if (getComputedStyle(body).display === 'none') return;
        if (body._animTimer) clearTimeout(body._animTimer);
        if (prefersReducedMotion) {
            body.style.display = 'none';
            return;
        }
        body.style.overflow = 'hidden';
        body.style.height = body.scrollHeight + 'px';
        void body.offsetHeight;
        body.style.transition = 'height 0.3s ease';
        body.style.height = '0px';
        body._animTimer = setTimeout(() => {
            body.style.display = 'none';
            body.style.height = '';
            body.style.overflow = '';
            body.style.transition = '';
            body._animTimer = null;
        }, 330);
    }

    // ===== Step accordion =====
    // Each step is an accordion item: locked until reachable, one open at a
    // time, and completed steps can be reopened from their headers.
    const step5Section = document.getElementById('step5Section');
    const stepItems = {
        1: document.getElementById('step1Item'),
        2: document.getElementById('step2Item'),
        3: document.getElementById('step3Item'),
        4: document.getElementById('step4Item'),
        5: document.getElementById('step5Item'),
    };
    const stepBodies = {
        1: document.getElementById('step1Section'),
        2: step2Section,
        3: step3Section,
        4: step4Section,
        5: step5Section,
    };
    let infoAdvanceDone = false;

    function isStepUnlocked(step) {
        return stepItems[step] && !stepItems[step].classList.contains('locked');
    }

    function unlockStep(step) {
        if (stepItems[step]) stepItems[step].classList.remove('locked');
    }

    function lockStep(step) {
        if (!stepItems[step]) return;
        stepItems[step].classList.add('locked');
        stepItems[step].classList.remove('open');
        collapseBody(stepBodies[step]);
        setStepSummary(step, '');
    }

    function openStep(step, scroll = true) {
        unlockStep(step);
        [1, 2, 3, 4, 5].forEach(n => {
            const isTarget = n === step;
            stepItems[n].classList.toggle('open', isTarget);
            if (isTarget) {
                expandBody(stepBodies[n]);
            } else {
                collapseBody(stepBodies[n]);
            }
        });
        if (scroll) {
            // Start right away and ride along while the panes resize
            setTimeout(() => {
                smoothScrollTo(stepItems[step], { duration: 700 });
            }, 50);
        }
    }

    function setStepSummary(step, text) {
        const summary = document.getElementById(`step${step}Summary`);
        if (summary) summary.textContent = text;
    }

    [1, 2, 3, 4, 5].forEach(step => {
        const header = document.getElementById(`step${step}Header`);
        if (header) {
            header.addEventListener('click', () => {
                if (!isStepUnlocked(step)) return;
                if (stepItems[step].classList.contains('open')) return;
                openStep(step, false);
            });
        }
    });

    openStep(1, false);

    // Initialize Flatpickr
    flatpickrInstance = flatpickr(dateInput, {
        dateFormat: 'Y-m-d',
        minDate: null,
        maxDate: null,
        disable: [],
        clickOpens: false,
        disableMobile: true,
        onChange: function(selectedDates, dateStr, instance) {
            fetchAvailableSlots();
        }
    });

    // Set timezone to browser's timezone
    setUserTimezone();

    // Fetch available slots when timezone changes
    timezoneSelect.addEventListener('change', fetchAvailableSlots);

    // Refresh time slots when format changes
    use24HourCheckbox.addEventListener('change', function() {
        if (dateInput.value && selectedMeetingType) {
            fetchAvailableSlots();
        }
    });

    // Refresh meeting types when format changes
    use24HourMeetingTypeCheckbox.addEventListener('change', function() {
        renderMeetingTypes();
    });

    // Check if form fields are complete and show location section
    function infoFieldsComplete() {
        return nameInput.value.trim() !== '' &&
            emailInput.value.trim() !== '' &&
            companyInput.value.trim() !== '' &&
            roleInput.value.trim() !== '';
    }

    function checkFormCompletion() {
        if (infoFieldsComplete() && selectedMeetingType) {
            unlockStep(4);
            // Coffee preselects its default spot, so the last step is reachable too
            if (selectedMeetingType.id === 'gamescom-coffee') {
                unlockStep(5);
            }
        }
    }

    // Leaving the info fields with everything filled advances to the location step
    [nameInput, emailInput, companyInput, roleInput].forEach(input => {
        input.addEventListener('blur', () => {
            if (infoAdvanceDone || !selectedMeetingType || !infoFieldsComplete()) return;
            infoAdvanceDone = true;
            setStepSummary(3, nameInput.value.trim());
            openStep(4);
        });
    });

    // Enable/disable book button based on form completion
    [nameInput, emailInput, companyInput, roleInput, dateInput].forEach(input => {
        input.addEventListener('input', () => {
            updateBookButtonState();
            checkFormCompletion();
        });
    });

    // Custom location inputs unlock Step 4 while typing and advance on blur
    const customLunchInput = document.getElementById('customLocationLunch');
    const customDinnerInput = document.getElementById('customLocationDinner');
    const customMeetingInput = document.getElementById('customLocationMeeting');
    const customCoffeeInput = document.getElementById('customLocationCoffee');

    [customLunchInput, customDinnerInput, customMeetingInput, customCoffeeInput].forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (this.value.trim() !== '') {
                    unlockStep(5);
                }
            });
            input.addEventListener('blur', function() {
                if (this.value.trim() !== '' && !stepItems[5].classList.contains('open')) {
                    openStep(5);
                }
            });
        }
    });

    // Email validation on blur (when user leaves the field)
    emailInput.addEventListener('blur', function() {
        const email = emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (email && !emailRegex.test(email)) {
            emailInput.classList.add('is-invalid');
            emailError.style.display = 'block';
        } else {
            emailInput.classList.remove('is-invalid');
            emailError.style.display = 'none';
        }
    });

    // Clear email error when user starts typing
    emailInput.addEventListener('focus', function() {
        emailInput.classList.remove('is-invalid');
        emailError.style.display = 'none';
    });

    // Update book button state when discussion details change
    discussionDetails.addEventListener('input', updateBookButtonState);

    // Vendor note: shown when networking or collaboration topics are picked
    const vendorNote = document.getElementById('vendorNote');
    const vendorTopicIds = ['topic-networking', 'topic-collaboration'];

    function updateVendorNote() {
        if (!vendorNote) return;
        const show = vendorTopicIds.some(id => {
            const checkbox = document.getElementById(id);
            return checkbox && checkbox.checked;
        });
        vendorNote.style.display = show ? 'block' : 'none';
    }

    vendorTopicIds.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.addEventListener('change', updateVendorNote);
    });

    // Tapping a defined term toggles its tooltip (for touch screens);
    // it closes on mouse-away or a tap anywhere else.
    function closeVendorTips() {
        document.querySelectorAll('.vendor-term.tip-open').forEach(t => {
            t.classList.remove('tip-open');
            t.blur();
        });
    }

    document.querySelectorAll('.vendor-term').forEach(term => {
        term.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const wasOpen = this.classList.contains('tip-open');
            closeVendorTips();
            if (!wasOpen) this.classList.add('tip-open');
        });
        term.addEventListener('mouseleave', function() {
            this.classList.remove('tip-open');
        });
    });

    document.addEventListener('click', closeVendorTips);

    renderMeetingTypes();
    function renderMeetingTypes() {
        meetingTypesContainer.innerHTML = '';
        const use24Hour = use24HourMeetingTypeCheckbox.checked;

        const unlockedIds = unlockedTypeIds();
        const visibleTypes = meetingTypes.filter((type) => !type.hidden || unlockedIds.includes(type.id));
        // Unlocked secret types go to the top of the list
        visibleTypes.sort((a, b) => (b.hidden ? 1 : 0) - (a.hidden ? 1 : 0));
        visibleTypes.forEach((type) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'meeting-type-card';
            card.dataset.meetingTypeId = type.id;

            const dailyStart = formatTimeForDisplay(type.dailyStart, use24Hour);
            
            // Calculate the end time: latest start time + duration
            const endTimeParts = type.dailyEnd.split(':');
            const endHour = parseInt(endTimeParts[0]);
            const endMinute = parseInt(endTimeParts[1] || '0');
            const totalEndMinutes = endHour * 60 + endMinute + type.durationMinutes;
            const actualEndHour = Math.floor(totalEndMinutes / 60);
            const actualEndMinute = totalEndMinutes % 60;
            const actualEndTime = `${String(actualEndHour).padStart(2, '0')}:${String(actualEndMinute).padStart(2, '0')}`;
            const dailyEnd = formatTimeForDisplay(actualEndTime, use24Hour);

            card.innerHTML = `
                <div class="meeting-type-header">
                    <h6 class="meeting-type-title">${type.title}</h6>
                    <span class="meeting-type-duration">${type.durationMinutes} min</span>
                </div>
                <p class="meeting-type-description">${type.description}</p>
                <div class="meeting-type-meta">
                    <span><i class="fas fa-clock"></i> ${dailyStart} - ${dailyEnd}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.meeting-type-card').forEach((btn) => btn.classList.remove('selected'));
                card.classList.add('selected');
                selectedMeetingType = type;
                selectedTime = null;

                // Hide time slots and step 3 when switching meeting types
                const timeSlotsContainer = document.getElementById('timeSlotsContainer');
                const timeSlotsDiv = document.getElementById('timeSlots');
                timeSlotsContainer.style.display = 'none';
                timeSlotsDiv.innerHTML = '';

                // Clear the date selection when switching meeting types (without triggering onChange)
                dateInput.value = '';
                flatpickrInstance.setDate(null, false); // false prevents onChange trigger

                updateDateRangeForMeetingType(type);
                setStepSummary(1, type.title);
                setStepSummary(2, '');
                lockStep(3);
                lockStep(4);
                lockStep(5);
                infoAdvanceDone = false;
                updateLocationSectionForMeetingType(type);
                updateBookButtonState();

                // Move on to date & time selection
                openStep(2);
            });

            meetingTypesContainer.appendChild(card);
        });
    }

    function updateDateRangeForMeetingType(type) {
        dateInput.disabled = false;
        flatpickrInstance.set('clickOpens', true);
        flatpickrInstance.set('minDate', type.dateStart);
        flatpickrInstance.set('maxDate', type.dateEnd);
        flatpickrInstance.set('disable', []);
        flatpickrInstance.set('defaultDate', type.dateStart);
        flatpickrInstance.clear();
        flatpickrInstance.setDate(null);
        flatpickrInstance.jumpToDate(type.dateStart);
        markUnavailableDays(type);
    }

    // Gray out dates with no open slots for this meeting type
    async function markUnavailableDays(type) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/availability-days?meeting_type=${encodeURIComponent(type.id)}`);
            if (!response.ok) return;
            const data = await response.json();
            // Ignore the result if the visitor switched types while we fetched
            if (!selectedMeetingType || selectedMeetingType.id !== type.id) return;
            const fullDays = (data.days || []).filter(d => !d.available).map(d => d.date);
            flatpickrInstance.set('disable', fullDays);
        } catch (error) {
            console.error('Could not load day availability:', error);
        }
    }

    function setUserTimezone() {
        // Lock to Köln local time for Gamescom
        timezoneSelect.value = 'Europe/Berlin';
    }

    function updateLocationSectionForMeetingType(type) {
        console.log('🎯 updateLocationSectionForMeetingType called for:', type.id);
        
        const locationMeetingSection = document.getElementById('locationMeetingSection');
        const locationLunchSection = document.getElementById('locationLunchSection');
        const locationDinnerSection = document.getElementById('locationDinnerSection');
        const locationCoffeeSection = document.getElementById('locationCoffeeSection');
        const customLunchDiv = document.getElementById('customLocationLunchDiv');
        const customDinnerDiv = document.getElementById('customLocationDinnerDiv');
        const customMeetingDiv = document.getElementById('customLocationMeetingDiv');

        // Hide all location sections and custom divs
        locationMeetingSection.style.display = 'none';
        locationLunchSection.style.display = 'none';
        locationDinnerSection.style.display = 'none';
        if (locationCoffeeSection) locationCoffeeSection.style.display = 'none';
        if (customLunchDiv) customLunchDiv.style.display = 'none';
        if (customDinnerDiv) customDinnerDiv.style.display = 'none';
        if (customMeetingDiv) customMeetingDiv.style.display = 'none';

        // Clear all location selections
        document.querySelectorAll('input[name="location"]').forEach(radio => radio.checked = false);
        document.getElementById('customLocationLunch').value = '';
        document.getElementById('customLocationDinner').value = '';
        const customMeetingInput = document.getElementById('customLocationMeeting');
        if (customMeetingInput) customMeetingInput.value = '';
        const customCoffeeInput = document.getElementById('customLocationCoffee');
        if (customCoffeeInput) customCoffeeInput.value = '';
        const customCoffeeDiv = document.getElementById('customLocationCoffeeDiv');
        if (customCoffeeDiv) customCoffeeDiv.style.display = 'none';

        // Hide any travel-time notes from a previous selection
        document.querySelectorAll('.travel-note-alert').forEach(el => el.style.display = 'none');

        updateVenuePreset();

        // Show appropriate section based on meeting type
        if (type.id === 'gamescom-lunch') {
            console.log('📍 Showing lunch location section');
            locationLunchSection.style.display = 'block';
        } else if (type.id === 'gamescom-dinner') {
            console.log('📍 Showing dinner location section');
            locationDinnerSection.style.display = 'block';
        } else if (type.id === 'gamescom-coffee') {
            console.log('📍 Showing coffee location section');
            if (locationCoffeeSection) locationCoffeeSection.style.display = 'block';
            const coffeeDefault = document.getElementById('loc-coffee-default');
            if (coffeeDefault) coffeeDefault.checked = true;
        } else if (type.id === 'gamescom-chat' || type.id === 'gamescom-extended' || type.id === 'gamescom-hour') {
            console.log('📍 Showing meeting location section');
            locationMeetingSection.style.display = 'block';
        }

        // Re-attach location radio listeners after section is visible
        attachLocationRadioListeners();
    }

    function attachLocationRadioListeners() {
        console.log('🔗 attachLocationRadioListeners called');
        
        // Get all location radio buttons and attach individual listeners
        const locationRadios = document.querySelectorAll('input[name="location"]');
        console.log(`Found ${locationRadios.length} location radio buttons`);
        
        locationRadios.forEach(radio => {
            // Remove old listeners first
            radio.removeEventListener('change', handleLocationChange);
            radio.removeEventListener('click', handleLocationClick);
            
            // Attach fresh listeners
            radio.addEventListener('change', handleLocationChange);
            radio.addEventListener('click', handleLocationClick);
        });
        
        console.log('✅ Event listeners attached to all location radio buttons');
    }

    function handleLocationClick(e) {
        console.log('🖱️ Click event on location radio:', e.target.id);
        // Create a synthetic event object that matches what change event would provide
        const event = { target: e.target };
        handleLocationChange(event);
    }

    function handleLocationChange(e) {
        if (e.target.name === 'location' && e.target.checked) {
            const customLunchDiv = document.getElementById('customLocationLunchDiv');
            const customDinnerDiv = document.getElementById('customLocationDinnerDiv');
            const customMeetingDiv = document.getElementById('customLocationMeetingDiv');
            const customCoffeeDiv = document.getElementById('customLocationCoffeeDiv');
            const customLunchInput = document.getElementById('customLocationLunch');
            const customDinnerInput = document.getElementById('customLocationDinner');
            const customMeetingInput = document.getElementById('customLocationMeeting');
            const customCoffeeInput = document.getElementById('customLocationCoffee');

            // Hide all custom input divs initially and make them not required
            if (customLunchDiv) {
                customLunchDiv.style.display = 'none';
                if (customLunchInput) customLunchInput.required = false;
            }
            if (customDinnerDiv) {
                customDinnerDiv.style.display = 'none';
                if (customDinnerInput) customDinnerInput.required = false;
            }
            if (customMeetingDiv) {
                customMeetingDiv.style.display = 'none';
                if (customMeetingInput) customMeetingInput.required = false;
            }
            if (customCoffeeDiv) {
                customCoffeeDiv.style.display = 'none';
                if (customCoffeeInput) customCoffeeInput.required = false;
            }
            
            // Show the 5-minute travel note when a hotel location is chosen
            document.querySelectorAll('.travel-note-alert').forEach(el => {
                el.style.display = e.target.dataset.travelNote ? 'block' : 'none';
            });

            // Show custom input ONLY for "Suggest a location" options (NOT for "We'll decide later")
            if (e.target.id === 'loc-dinner-custom') {
                if (customDinnerDiv) customDinnerDiv.style.display = 'block';
                if (customDinnerInput) customDinnerInput.required = true;
            } else if (e.target.id === 'loc-meeting-custom') {
                if (customMeetingDiv) customMeetingDiv.style.display = 'block';
                if (customMeetingInput) customMeetingInput.required = true;
            } else if (e.target.id === 'loc-lunch-custom') {
                if (customLunchDiv) customLunchDiv.style.display = 'block';
                if (customLunchInput) customLunchInput.required = true;
            } else if (e.target.id === 'loc-coffee-custom') {
                if (customCoffeeDiv) customCoffeeDiv.style.display = 'block';
                if (customCoffeeInput) customCoffeeInput.required = true;
            }

            // Move on to the discussion step for preset and "decide later" options
            const needsCustomInput = ['loc-dinner-custom', 'loc-meeting-custom', 'loc-lunch-custom', 'loc-coffee-custom'];
            if (!needsCustomInput.includes(e.target.id)) {
                openStep(5);
            }
        }
    }

    function convertTo12Hour(time24) {
        const [hour, minute] = time24.split(':');
        const hourNum = parseInt(hour, 10);
        const ampm = hourNum >= 12 ? 'pm' : 'am';
        const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
        return `${hour12}:${minute}${ampm}`;
    }

    function formatTimeForDisplay(time24, use24Hour) {
        return use24Hour ? time24 : convertTo12Hour(time24);
    }

    // ===== Visitor calendar comparison =====
    // Overlays the visitor's own busy times on the slot grid. Google/Outlook
    // read free-busy directly from the browser; Calendly goes through the API
    // worker (their API blocks browser calls); .ics files parse locally.
    const GOOGLE_OAUTH_CLIENT_ID = '480059803396-s8an2c1jnhrefp6klabluhn2e75661kk.apps.googleusercontent.com';
    const MS_OAUTH_CLIENT_ID = '';     // paste a Microsoft Entra app (SPA) client ID to enable
    const CALENDLY_ENABLED = false;    // set true once Calendly secrets are set on the API worker

    let visitorSource = null;          // 'google' | 'outlook' | 'calendly' | 'ics'
    let visitorBusyIntervals = null;   // [{startMs, endMs}] for the selected date
    let googleAccessToken = null;
    let googleTokenClient = null;
    let msalInstance = null;
    let msAccessToken = null;
    let calendlyToken = null;
    let calendlyState = null;
    let icsEvents = null;              // all parsed [{startMs, endMs}] from an uploaded file

    const calendarCompareDiv = document.getElementById('calendarCompare');
    const googleCompareBtn = document.getElementById('googleCompareBtn');
    const outlookCompareBtn = document.getElementById('outlookCompareBtn');
    const calendlyCompareBtn = document.getElementById('calendlyCompareBtn');
    const icsCompareBtn = document.getElementById('icsCompareBtn');
    const icsFileInput = document.getElementById('icsFileInput');
    const compareStatus = document.getElementById('compareStatus');

    function setCompareStatus(message) {
        if (compareStatus) compareStatus.textContent = message;
    }

    if (calendarCompareDiv) {
        calendarCompareDiv.style.display = 'block';
        if (GOOGLE_OAUTH_CLIENT_ID && googleCompareBtn) {
            googleCompareBtn.style.display = 'inline-block';
            googleCompareBtn.addEventListener('click', connectGoogleCalendar);
        }
        if (MS_OAUTH_CLIENT_ID && outlookCompareBtn) {
            outlookCompareBtn.style.display = 'inline-block';
            outlookCompareBtn.addEventListener('click', connectOutlook);
        }
        if (CALENDLY_ENABLED && calendlyCompareBtn) {
            calendlyCompareBtn.style.display = 'inline-block';
            calendlyCompareBtn.addEventListener('click', connectCalendly);
        }
        if (icsCompareBtn && icsFileInput) {
            icsCompareBtn.addEventListener('click', () => icsFileInput.click());
            icsFileInput.addEventListener('change', handleIcsUpload);
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    async function connectGoogleCalendar() {
        try {
            if (!(window.google && google.accounts && google.accounts.oauth2)) {
                setCompareStatus('Loading Google sign-in...');
                await loadScript('https://accounts.google.com/gsi/client');
            }
            if (!googleTokenClient) {
                googleTokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_OAUTH_CLIENT_ID,
                    scope: 'https://www.googleapis.com/auth/calendar.freebusy',
                    callback: (response) => {
                        if (response && response.access_token) {
                            googleAccessToken = response.access_token;
                            visitorSource = 'google';
                            refreshVisitorBusy();
                        } else {
                            setCompareStatus('Google Calendar connection failed.');
                        }
                    },
                });
            }
            googleTokenClient.requestAccessToken();
        } catch (error) {
            console.error(error);
            setCompareStatus('Could not load Google sign-in.');
        }
    }

    async function connectOutlook() {
        try {
            if (!window.msal) {
                setCompareStatus('Loading Microsoft sign-in...');
                await loadScript('https://cdn.jsdelivr.net/npm/@azure/msal-browser@3/lib/msal-browser.min.js');
            }
            if (!msalInstance) {
                msalInstance = new msal.PublicClientApplication({
                    auth: {
                        clientId: MS_OAUTH_CLIENT_ID,
                        authority: 'https://login.microsoftonline.com/common',
                        redirectUri: window.location.origin,
                    },
                });
                await msalInstance.initialize();
            }
            const result = await msalInstance.acquireTokenPopup({ scopes: ['Calendars.Read'] });
            msAccessToken = result.accessToken;
            visitorSource = 'outlook';
            refreshVisitorBusy();
        } catch (error) {
            console.error(error);
            setCompareStatus('Microsoft sign-in failed or was cancelled.');
        }
    }

    function connectCalendly() {
        calendlyState = Math.random().toString(36).slice(2) + Date.now().toString(36);
        window.open(
            `${API_BASE_URL}/api/calendly/login?state=${calendlyState}`,
            'calendly-connect',
            'width=600,height=720'
        );
        setCompareStatus('Waiting for Calendly...');
    }

    window.addEventListener('message', (event) => {
        if (event.origin !== API_BASE_URL) return;
        const data = event.data;
        if (!data || data.type !== 'calendly-connect' || !calendlyState || data.state !== calendlyState) return;
        if (data.token) {
            calendlyToken = data.token;
            visitorSource = 'calendly';
            refreshVisitorBusy();
        } else {
            setCompareStatus(data.error || 'Calendly connection failed.');
        }
    });

    function handleIcsUpload() {
        const file = icsFileInput.files && icsFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            icsEvents = parseIcsBusyTimes(String(reader.result));
            visitorSource = 'ics';
            if (icsEvents.length === 0) {
                setCompareStatus('No timed events found in that file for the Gamescom window.');
            }
            refreshVisitorBusy();
        };
        reader.onerror = () => setCompareStatus('Could not read that file.');
        reader.readAsText(file);
        icsFileInput.value = '';
    }

    // Minimal .ics reader: timed, non-cancelled, non-transparent events. All-day
    // events and recurrence rules are skipped.
    function parseIcsBusyTimes(text) {
        const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
        const events = [];
        const windowStartMs = new Date('2026-08-15T00:00:00Z').getTime();
        const windowEndMs = new Date('2026-09-05T00:00:00Z').getTime();

        for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
            const body = block.split('END:VEVENT')[0];
            if (/^STATUS:CANCELLED$/m.test(body) || /^TRANSP:TRANSPARENT$/m.test(body)) continue;
            const startMs = parseIcsDate(body, 'DTSTART');
            const endMs = parseIcsDate(body, 'DTEND');
            if (startMs === null || endMs === null) continue;
            if (endMs <= windowStartMs || startMs >= windowEndMs) continue;
            events.push({ startMs, endMs });
        }
        return events;
    }

    function parseIcsDate(body, prop) {
        const match = body.match(new RegExp(`^${prop}(;[^:]*)?:(.+)$`, 'm'));
        if (!match) return null;
        const params = match[1] || '';
        const value = match[2].trim();
        if (params.includes('VALUE=DATE') || !value.includes('T')) return null; // all-day
        const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
        if (!m) return null;
        const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`;
        if (m[7] === 'Z') return new Date(iso + 'Z').getTime();
        const tzidMatch = params.match(/TZID=([^;:]+)/);
        if (tzidMatch) return zonedTimeToMs(iso, tzidMatch[1]);
        return new Date(iso).getTime(); // floating time: treat as the visitor's local time
    }

    // Convert a wall-clock time in an IANA timezone to a UTC timestamp.
    function zonedTimeToMs(isoLocal, timeZone) {
        try {
            const utcGuess = new Date(isoLocal + 'Z').getTime();
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false,
            }).formatToParts(new Date(utcGuess));
            const get = (type) => parts.find(p => p.type === type).value;
            const localAsUtc = Date.UTC(+get('year'), get('month') - 1, +get('day'), +get('hour'), +get('minute'), +get('second'));
            return utcGuess - (localAsUtc - utcGuess);
        } catch (e) {
            return new Date(isoLocal).getTime();
        }
    }

    async function refreshVisitorBusy() {
        const date = dateInput.value;
        if (!date || !visitorSource) return;
        const dayStartIso = new Date(`${date}T00:00:00+02:00`).toISOString();
        const dayEndIso = new Date(`${date}T23:59:59+02:00`).toISOString();

        try {
            let busy = [];
            if (visitorSource === 'google') {
                const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${googleAccessToken}` },
                    body: JSON.stringify({ timeMin: dayStartIso, timeMax: dayEndIso, items: [{ id: 'primary' }] }),
                });
                if (!response.ok) throw new Error('Google Calendar request failed');
                const data = await response.json();
                busy = ((data.calendars && data.calendars.primary && data.calendars.primary.busy) || [])
                    .map(b => ({ startMs: new Date(b.start).getTime(), endMs: new Date(b.end).getTime() }));
            } else if (visitorSource === 'outlook') {
                const graphUrl = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(dayStartIso)}&endDateTime=${encodeURIComponent(dayEndIso)}&$select=start,end,showAs,isCancelled&$top=100`;
                const response = await fetch(graphUrl, {
                    headers: { Authorization: `Bearer ${msAccessToken}`, Prefer: 'outlook.timezone="UTC"' },
                });
                if (!response.ok) throw new Error('Outlook request failed');
                const data = await response.json();
                busy = (data.value || [])
                    .filter(e => !e.isCancelled && e.showAs !== 'free')
                    .map(e => ({
                        startMs: new Date(e.start.dateTime + (e.start.dateTime.endsWith('Z') ? '' : 'Z')).getTime(),
                        endMs: new Date(e.end.dateTime + (e.end.dateTime.endsWith('Z') ? '' : 'Z')).getTime(),
                    }));
            } else if (visitorSource === 'calendly') {
                const response = await fetch(`${API_BASE_URL}/api/calendly/busy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: calendlyToken, startTime: dayStartIso, endTime: dayEndIso }),
                });
                if (!response.ok) throw new Error('Calendly request failed');
                const data = await response.json();
                busy = (data.busy || []).map(b => ({ startMs: new Date(b.start).getTime(), endMs: new Date(b.end).getTime() }));
            } else if (visitorSource === 'ics') {
                busy = icsEvents || [];
            }

            visitorBusyIntervals = busy;
            setCompareStatus('Connected. Busy slots are crossed out.');
            applyVisitorBusyOverlay();
        } catch (error) {
            console.error('Visitor calendar error:', error);
            visitorBusyIntervals = null;
            setCompareStatus('Could not read your calendar for this date.');
        }
    }

    function applyVisitorBusyOverlay() {
        if (!visitorBusyIntervals || !selectedMeetingType) return;
        const date = dateInput.value;
        if (!date) return;
        const durationMs = selectedMeetingType.durationMinutes * 60000;
        document.querySelectorAll('.time-slot').forEach(btn => {
            btn.classList.remove('visitor-busy');
            if (btn.dataset.usRef) btn.title = btn.dataset.usRef;
            if (btn.disabled) return;
            const startMs = new Date(`${date}T${btn.dataset.time}:00+02:00`).getTime();
            const endMs = startMs + durationMs;
            const clash = visitorBusyIntervals.some(b => startMs < b.endMs && endMs > b.startMs);
            if (clash) {
                btn.classList.add('visitor-busy');
                btn.title = `${btn.dataset.usRef ? btn.dataset.usRef + ' | ' : ''}Your calendar shows you busy here`;
            }
        });
    }

    // Coffee has no location choice: Dorint through Aug 25, Business Area after.
    function getCoffeeLocation() {
        const date = dateInput.value;
        return date && date >= '2026-08-26'
            ? 'Gamescom Business Area (Koelnmesse)'
            : 'Dorint Hotel an der Messe, Köln';
    }

    // Köln is CEST (UTC+2) for all Gamescom dates, so the offset is fixed.
    function formatUsReference(date, time) {
        const utcDate = new Date(`${date}T${time}:00+02:00`);
        const fmt = (tz) => utcDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: tz,
        });
        return `${fmt('America/New_York')} US Eastern / ${fmt('America/Los_Angeles')} US Pacific`;
    }

    function updateUsTimeReference() {
        const referenceDiv = document.getElementById('usTimeReference');
        if (!referenceDiv) return;
        const date = dateInput.value;
        if (date && selectedTime) {
            referenceDiv.innerHTML = `<i class="fas fa-globe-americas me-1"></i>In the US: <strong>${formatUsReference(date, selectedTime)}</strong>`;
            referenceDiv.style.display = 'block';
        } else {
            referenceDiv.style.display = 'none';
        }
        // The 11:30 block hands off to lunch and runs 5 minutes shorter
        const handoffNote = document.getElementById('lunchHandoffNote');
        if (handoffNote) {
            const isMeal = selectedMeetingType && ['gamescom-lunch', 'gamescom-dinner', 'gamescom-coffee'].includes(selectedMeetingType.id);
            handoffNote.style.display = (selectedTime === '11:30' && !isMeal) ? 'block' : 'none';
        }
    }

    // The venue preset depends on the selected date: Gamescom Dev runs in the
    // Confex Center through Aug 25; the Business Area only opens on Aug 26.
    function updateVenuePreset() {
        const date = dateInput.value;
        const isBusinessArea = date && date >= '2026-08-26';
        const venueName = isBusinessArea
            ? 'Gamescom Business Area (Koelnmesse)'
            : 'Gamescom Dev, Confex Center (Koelnmesse)';
        document.querySelectorAll('.venue-preset').forEach(radio => {
            radio.value = `${venueName} (we'll pick an exact spot)`;
        });
        document.querySelectorAll('.venue-preset-label').forEach(el => {
            el.textContent = venueName;
        });
        const coffeeLocationText = document.getElementById('coffeeLocationText');
        if (coffeeLocationText) coffeeLocationText.textContent = getCoffeeLocation();
        const coffeeDefaultRadio = document.getElementById('loc-coffee-default');
        if (coffeeDefaultRadio) coffeeDefaultRadio.value = getCoffeeLocation();
    }

    function fetchAvailableSlots() {
        const date = dateInput.value;
        const timezone = timezoneSelect.value;

        updateVenuePreset();
        refreshVisitorBusy();


        if (!selectedMeetingType) {
            const slotsContainer = document.getElementById('timeSlotsContainer');
            const timeSlotsDiv = document.getElementById('timeSlots');
            slotsContainer.style.display = 'block';
            timeSlotsDiv.innerHTML = '<div class="alert alert-info w-100">Select a meeting type.</div>';
            return;
        }

        if (!date) {
            const slotsContainer = document.getElementById('timeSlotsContainer');
            slotsContainer.style.display = 'none';
            return;
        }

        const loadingSpinner = document.getElementById('loadingSlots');
        const slotsContainer = document.getElementById('timeSlotsContainer');
        const timeSlotsDiv = document.getElementById('timeSlots');

        loadingSpinner.style.display = 'inline-block';
        slotsContainer.style.display = 'none';

        const queryParams = new URLSearchParams({
            date: date,
            meeting_type: selectedMeetingType.id,
        });

        fetch(`${API_BASE_URL}/api/availability?${queryParams}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch availability');
            return response.json();
        })
        .then(slots => {
            timeSlotsDiv.innerHTML = '';
            selectedTime = null;
            updateUsTimeReference();

            if (!slots || slots.length === 0) {
                timeSlotsDiv.innerHTML = '<div class="alert alert-info w-100">No available slots for this date.</div>';
                slotsContainer.style.display = 'block';
                loadingSpinner.style.display = 'none';
                return;
            }

            slots.forEach(slot => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'time-slot';
                const use24Hour = use24HourCheckbox.checked;
                button.textContent = formatTimeForDisplay(slot.time, use24Hour);
                button.disabled = !slot.available;
                button.dataset.time = slot.time;

                if (slot.available) {
                    button.dataset.usRef = formatUsReference(date, slot.time);
                    button.title = button.dataset.usRef;
                    button.addEventListener('click', function() {
                        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
                        this.classList.add('selected');
                        selectedTime = this.dataset.time;
                        updateUsTimeReference();
                        updateBookButtonState();

                        const slotDate = new Date(dateInput.value + 'T00:00:00');
                        const dateLabel = slotDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        setStepSummary(2, `${dateLabel}, ${formatTimeForDisplay(selectedTime, use24HourCheckbox.checked)}`);

                        // Move on to the information step
                        openStep(3);
                    });
                }

                timeSlotsDiv.appendChild(button);
            });

            slotsContainer.style.display = 'block';
            loadingSpinner.style.display = 'none';
            applyVisitorBusyOverlay();
        })
        .catch(error => {
            console.error('Error:', error);
            errorMessage.textContent = 'Failed to load available slots. Please try again.';
            errorMessage.style.display = 'block';
            loadingSpinner.style.display = 'none';
        });
    }

    function updateBookButtonState() {
        const hasMeetingType = selectedMeetingType !== null;
        const hasName = nameInput.value.trim() !== '';
        const hasEmail = emailInput.value.trim() !== '';
        const hasCompany = companyInput.value.trim() !== '';
        const hasRole = roleInput.value.trim() !== '';
        const hasDate = dateInput.value !== '';
        const hasTime = selectedTime !== null;
        const hasDiscussion = discussionDetails.value.trim() !== '';

        bookButton.disabled = !(hasMeetingType && hasName && hasEmail && hasCompany && hasRole && hasDate && hasTime && hasDiscussion);
    }

    bookButton.addEventListener('click', bookAppointment);

    function bookAppointment() {
        if (!selectedMeetingType) {
            errorMessage.textContent = 'Please select a meeting type first.';
            errorMessage.style.display = 'block';
            return;
        }

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const company = companyInput.value.trim();
        const role = roleInput.value.trim();
        const date = dateInput.value;
        const time = selectedTime;
        const timezone = timezoneSelect.value;
        
        // Get selected location
        let location = '';
        const selectedLocationRadio = document.querySelector('input[name="location"]:checked');
        if (selectedLocationRadio) {
            location = selectedLocationRadio.value;
        }

        // Get custom location if provided
        if (!location || location === '') {
            if (selectedMeetingType.id === 'gamescom-lunch') {
                const customLunch = document.getElementById('customLocationLunch').value.trim();
                if (customLunch) {
                    location = customLunch;
                }
            } else if (selectedMeetingType.id === 'gamescom-dinner') {
                const customDinner = document.getElementById('customLocationDinner').value.trim();
                if (customDinner) {
                    location = customDinner;
                }
            } else if (selectedMeetingType.id === 'gamescom-chat' || selectedMeetingType.id === 'gamescom-extended' || selectedMeetingType.id === 'gamescom-hour') {
                const customMeeting = document.getElementById('customLocationMeeting').value.trim();
                if (customMeeting) {
                    location = customMeeting;
                }
            } else if (selectedMeetingType.id === 'gamescom-coffee') {
                const customCoffee = document.getElementById('customLocationCoffee').value.trim();
                if (customCoffee) {
                    location = customCoffee;
                }
            }
        }

        // Collect selected topics
        const selectedTopics = [];
        document.querySelectorAll('input[id^="topic-"]:checked').forEach(checkbox => {
            selectedTopics.push(checkbox.value);
        });
        const discussionText = discussionDetails.value.trim();

        if (!name || !email || !company || !role || !date || !time || !discussionText || !location) {
            errorMessage.textContent = 'Please fill in all required fields, including location.';
            errorMessage.style.display = 'block';
            return;
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errorMessage.textContent = 'Please enter a valid email address.';
            errorMessage.style.display = 'block';
            return;
        }

        bookButton.disabled = true;
        bookButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Booking...';
        errorMessage.style.display = 'none';
        confirmationMessage.style.display = 'none';

        fetch(`${API_BASE_URL}/api/book`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                meeting_type_id: selectedMeetingType.id,
                name: name,
                email: email,
                company: company,
                role: role,
                date: date,
                time: time,
                timezone: timezone,
                location: location,
                discussion_topics: selectedTopics,
                discussion_details: discussionText
            }),
        })
            .then(async response => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message = data && data.error ? data.error : 'Booking failed';
                    throw new Error(message);
                }
                return data;
            })
            .then(data => {
                if (data && (data.success === true || data.success === 'true')) {
                // Clear form inputs
                nameInput.value = '';
                emailInput.value = '';
                companyInput.value = '';
                roleInput.value = '';
                discussionDetails.value = '';
                
                // Reset meeting type selection
                selectedMeetingType = null;
                document.querySelectorAll('.meeting-type-card').forEach(card => {
                    card.classList.remove('selected');
                });
                meetingTypeHint.textContent = '';

                // Reset date picker and time slots
                flatpickrInstance.clear();
                dateInput.value = '';
                dateInput.disabled = true;
                selectedTime = null;
                const timeSlotsContainer = document.getElementById('timeSlotsContainer');
                const timeSlotsDiv = document.getElementById('timeSlots');
                timeSlotsContainer.style.display = 'none';
                timeSlotsDiv.innerHTML = '<div class="alert alert-info w-100">Select a meeting type.</div>';

                // Clear location selections and hide location sections
                document.querySelectorAll('input[name="location"]').forEach(radio => {
                    radio.checked = false;
                });
                const locationMeetingSection = document.getElementById('locationMeetingSection');
                const locationLunchSection = document.getElementById('locationLunchSection');
                const locationDinnerSection = document.getElementById('locationDinnerSection');
                const customLunchDiv = document.getElementById('customLocationLunchDiv');
                const customDinnerDiv = document.getElementById('customLocationDinnerDiv');
                const customMeetingDiv = document.getElementById('customLocationMeetingDiv');
                if (locationMeetingSection) locationMeetingSection.style.display = 'none';
                if (locationLunchSection) locationLunchSection.style.display = 'none';
                if (locationDinnerSection) locationDinnerSection.style.display = 'none';
                if (customLunchDiv) customLunchDiv.style.display = 'none';
                if (customDinnerDiv) customDinnerDiv.style.display = 'none';
                if (customMeetingDiv) customMeetingDiv.style.display = 'none';
                const customLunchInput = document.getElementById('customLocationLunch');
                const customDinnerInput = document.getElementById('customLocationDinner');
                const customMeetingInput = document.getElementById('customLocationMeeting');
                if (customLunchInput) customLunchInput.value = '';
                if (customDinnerInput) customDinnerInput.value = '';
                if (customMeetingInput) customMeetingInput.value = '';
                
                // Clear discussion topics
                document.querySelectorAll('input[id^="topic-"]').forEach(checkbox => {
                    checkbox.checked = false;
                });
                updateVendorNote();
                
                // Reset the accordion to step 1
                lockStep(2);
                lockStep(3);
                lockStep(4);
                lockStep(5);
                setStepSummary(1, '');
                infoAdvanceDone = false;
                openStep(1, false);
                
                confirmationMessage.style.display = 'block';
                setTimeout(() => {
                    // Scroll to confirmation
                    smoothScrollTo(confirmationMessage);
                }, 100);

                // Reload available slots (will be empty since no meeting type selected)
                fetchAvailableSlots();
            } else {
                    throw new Error('Unexpected response');
            }
        })
        .catch(error => {
            console.error('Error:', error);
                errorMessage.textContent = error && error.message ? error.message : 'Failed to book appointment. Please try again.';
            errorMessage.style.display = 'block';
        })
        .finally(() => {
            bookButton.disabled = false;
            bookButton.innerHTML = '<i class="fas fa-calendar-check me-2"></i>Request Meeting';
            updateBookButtonState();
        });
    }
});
