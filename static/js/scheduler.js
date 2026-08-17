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
            description: "25 minutes to meet, catch up, or talk through what's on your mind.",
            durationMinutes: 25,
            mode: 'In-person (Gamescom, Köln)',
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '09:30',
            dailyEnd: '17:30',
        },
        {
            id: 'gamescom-lunch',
            title: "Gamescom: Let's Grab Lunch!",
            description: 'Meet in person for lunch during Gamescom.',
            durationMinutes: 60,
            mode: 'In-person (Gamescom, Köln)',
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '12:00',
            dailyEnd: '13:30',
        },
        {
            id: 'gamescom-dinner',
            title: 'Gamescom: Dinner & Drinks',
            description: 'Dinner and drinks from 7pm, the best way to wind down a Gamescom day. Available every evening, starting Saturday, August 22.',
            durationMinutes: 90,
            mode: 'In-person (Gamescom, Köln)',
            dateStart: '2026-08-22',
            dateEnd: '2026-08-28',
            dailyStart: '19:00',
            dailyEnd: '20:30',
        },
        {
            id: 'gamescom-coffee',
            title: 'Gamescom: Rise & Shine',
            description: 'Quick coffee or breakfast before the halls open.',
            durationMinutes: 30,
            mode: 'In-person (Gamescom, Köln)',
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '09:00',
            dailyEnd: '09:00',
        },
        {
            id: 'gamescom-extended',
            title: '🎮 Gamescom: Extended Play',
            description: "A full 50 minutes for conversations that need room to breathe.",
            durationMinutes: 50,
            mode: 'In-person (Gamescom, Köln)',
            dateStart: '2026-08-23',
            dateEnd: '2026-08-28',
            dailyStart: '09:30',
            dailyEnd: '17:00',
            hidden: true,
        },
    ];

    // ===== Access code: unlocks the Extended Play meeting type =====
    const UNLOCK_CODE = 'EXTRATIME';
    let extendedUnlocked = false;
    try {
        extendedUnlocked = localStorage.getItem('extendedPlayUnlocked') === '1';
    } catch (e) { /* storage unavailable */ }

    const unlockStyles = document.createElement('style');
    unlockStyles.textContent = [
        '@keyframes unlockGlow {',
        '  0%, 100% { box-shadow: 0 0 0 2px #f18900, 0 0 28px rgba(241, 137, 0, 0.85); }',
        '  50% { box-shadow: 0 0 0 2px #ff9101, 0 0 10px rgba(241, 137, 0, 0.35); }',
        '}',
        '.unlocked-card { animation: unlockGlow 1.1s ease-in-out 5; }'
    ].join('\n');
    document.head.appendChild(unlockStyles);

    function unlockExtended() {
        if (extendedUnlocked) return;
        extendedUnlocked = true;
        try { localStorage.setItem('extendedPlayUnlocked', '1'); } catch (e) {}
        renderMeetingTypes();
        meetingTypeHint.textContent = 'Code accepted! Extended Play unlocked: a full 50-minute meeting.';
        const unlockedCard = meetingTypesContainer.querySelector('[data-meeting-type-id="gamescom-extended"]');
        if (unlockedCard) {
            unlockedCard.classList.add('unlocked-card');
            setTimeout(function() {
                unlockedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        if (entered === UNLOCK_CODE) {
            unlockExtended();
            if (accessCodeSection) accessCodeSection.style.display = 'none';
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
    if (extendedUnlocked && accessCodeSection) {
        accessCodeSection.style.display = 'none';
    }

    dateInput.disabled = true;
    step2Section.style.display = 'none';
    step3Section.style.display = 'none';
    step4Section.style.display = 'none';

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
    function checkFormCompletion() {
        const hasName = nameInput.value.trim() !== '';
        const hasEmail = emailInput.value.trim() !== '';
        const hasCompany = companyInput.value.trim() !== '';
        const hasRole = roleInput.value.trim() !== '';
        
        if (hasName && hasEmail && hasCompany && hasRole && selectedMeetingType) {
            // Show the appropriate location section based on selected meeting type
            if (selectedMeetingType.id === 'gamescom-lunch') {
                document.getElementById('locationLunchSection').style.display = 'block';
            } else if (selectedMeetingType.id === 'gamescom-dinner') {
                document.getElementById('locationDinnerSection').style.display = 'block';
            } else if (selectedMeetingType.id === 'gamescom-coffee') {
                // Coffee has a fixed, date-based location, so no choice is needed
                updateVenuePreset();
                document.getElementById('locationCoffeeSection').style.display = 'block';
                step4Section.style.display = 'block';
            } else {
                document.getElementById('locationMeetingSection').style.display = 'block';
            }
        }
    }

    // Enable/disable book button based on form completion
    [nameInput, emailInput, companyInput, roleInput, dateInput].forEach(input => {
        input.addEventListener('input', () => {
            updateBookButtonState();
            checkFormCompletion();
        });
    });

    // Keep step 4 hidden until a valid location is selected
    step4Section.style.display = 'none';

    // Add event listeners to custom location inputs to show Step 4 when filled
    const customLunchInput = document.getElementById('customLocationLunch');
    const customDinnerInput = document.getElementById('customLocationDinner');
    const customMeetingInput = document.getElementById('customLocationMeeting');
    
    [customLunchInput, customDinnerInput, customMeetingInput].forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (this.value.trim() !== '') {
                    step4Section.style.display = 'block';
                    setTimeout(() => {
                        step4Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
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

    function formatDateRange(startDate, endDate) {
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);
        const options = { month: 'short', day: 'numeric' };
        return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, options)}`;
    }

    renderMeetingTypes();
    function renderMeetingTypes() {
        meetingTypesContainer.innerHTML = '';
        const use24Hour = use24HourMeetingTypeCheckbox.checked;

        meetingTypes.filter((type) => !type.hidden || extendedUnlocked).forEach((type) => {
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
                    <span><i class="fas fa-map-marker-alt"></i> ${type.mode}</span>
                    <span><i class="fas fa-calendar"></i> ${formatDateRange(type.dateStart, type.dateEnd)}</span>
                    <span><i class="fas fa-clock"></i> ${dailyStart} - ${dailyEnd}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.meeting-type-card').forEach((btn) => btn.classList.remove('selected'));
                card.classList.add('selected');
                selectedMeetingType = type;
                selectedTime = null;
                meetingTypeHint.textContent = 'Meeting type selected. Choose an available time below.';

                // Hide time slots and step 3 when switching meeting types
                const timeSlotsContainer = document.getElementById('timeSlotsContainer');
                const timeSlotsDiv = document.getElementById('timeSlots');
                timeSlotsContainer.style.display = 'none';
                timeSlotsDiv.innerHTML = '';

                // Clear the date selection when switching meeting types (without triggering onChange)
                dateInput.value = '';
                flatpickrInstance.setDate(null, false); // false prevents onChange trigger

                updateDateRangeForMeetingType(type);
                step2Section.style.display = 'block';
                step3Section.style.display = 'none';
                step4Section.style.display = 'none';
                updateLocationSectionForMeetingType(type);
                updateBookButtonState();
                
                // Don't fetch slots or scroll - wait for date selection
            });

            meetingTypesContainer.appendChild(card);
        });
    }

    function updateDateRangeForMeetingType(type) {
        dateInput.disabled = false;
        flatpickrInstance.set('clickOpens', true);
        flatpickrInstance.set('minDate', type.dateStart);
        flatpickrInstance.set('maxDate', type.dateEnd);
        flatpickrInstance.set('defaultDate', type.dateStart);
        flatpickrInstance.clear();
        flatpickrInstance.setDate(null);
        flatpickrInstance.jumpToDate(type.dateStart);
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
        } else if (type.id === 'gamescom-chat' || type.id === 'gamescom-extended') {
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
            const customLunchInput = document.getElementById('customLocationLunch');
            const customDinnerInput = document.getElementById('customLocationDinner');
            const customMeetingInput = document.getElementById('customLocationMeeting');
            
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
            }

            // Show Step 4 for preset locations and "We'll decide later" options
            const needsCustomInput = ['loc-dinner-custom', 'loc-meeting-custom', 'loc-lunch-custom'];
            if (!needsCustomInput.includes(e.target.id)) {
                step4Section.style.display = 'block';
                setTimeout(() => {
                    step4Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
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
            referenceDiv.innerHTML = `<i class="fas fa-globe-americas me-1"></i>Selected time in the US: <strong>${formatUsReference(date, selectedTime)}</strong>`;
            referenceDiv.style.display = 'block';
        } else {
            referenceDiv.style.display = 'none';
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
    }

    function fetchAvailableSlots() {
        const date = dateInput.value;
        const timezone = timezoneSelect.value;

        updateVenuePreset();


        if (!selectedMeetingType) {
            const slotsContainer = document.getElementById('timeSlotsContainer');
            const timeSlotsDiv = document.getElementById('timeSlots');
            slotsContainer.style.display = 'block';
            timeSlotsDiv.innerHTML = '<div class="alert alert-info w-100">Select a meeting type to see available times.</div>';
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
                    button.title = formatUsReference(date, slot.time);
                    button.addEventListener('click', function() {
                        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
                        this.classList.add('selected');
                        selectedTime = this.dataset.time;
                        updateUsTimeReference();
                        updateBookButtonState();
                        
                        // Show step 3 and scroll to it when time is selected
                        step3Section.style.display = 'block';
                        
                        // Hide all location sections initially until form is filled
                        document.getElementById('locationMeetingSection').style.display = 'none';
                        document.getElementById('locationLunchSection').style.display = 'none';
                        document.getElementById('locationDinnerSection').style.display = 'none';
                        const coffeeSection = document.getElementById('locationCoffeeSection');
                        if (coffeeSection) coffeeSection.style.display = 'none';
                        
                        setTimeout(() => {
                            step3Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                    });
                }

                timeSlotsDiv.appendChild(button);
            });

            slotsContainer.style.display = 'block';
            loadingSpinner.style.display = 'none';
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
        
        // Get selected location (coffee is auto-assigned by date, no choice)
        let location = '';
        if (selectedMeetingType.id === 'gamescom-coffee') {
            location = getCoffeeLocation();
        } else {
            const selectedLocationRadio = document.querySelector('input[name="location"]:checked');
            if (selectedLocationRadio) {
                location = selectedLocationRadio.value;
            }
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
            } else if (selectedMeetingType.id === 'gamescom-chat' || selectedMeetingType.id === 'gamescom-extended') {
                const customMeeting = document.getElementById('customLocationMeeting').value.trim();
                if (customMeeting) {
                    location = customMeeting;
                }
            }
        }

        // Collect selected topics
        const selectedTopics = [];
        document.querySelectorAll('.form-check-input:checked').forEach(checkbox => {
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
                meetingTypeHint.textContent = 'Choose a meeting type to see available times.';

                // Reset date picker and time slots
                flatpickrInstance.clear();
                dateInput.value = '';
                dateInput.disabled = true;
                selectedTime = null;
                const timeSlotsContainer = document.getElementById('timeSlotsContainer');
                const timeSlotsDiv = document.getElementById('timeSlots');
                timeSlotsContainer.style.display = 'none';
                timeSlotsDiv.innerHTML = '<div class="alert alert-info w-100">Select a meeting type to see available times.</div>';

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
                document.querySelectorAll('input[name="topics"]').forEach(checkbox => {
                    checkbox.checked = false;
                });
                
                // Hide all sections except step 1
                step2Section.style.display = 'none';
                step3Section.style.display = 'none';
                step4Section.style.display = 'none';
                
                confirmationMessage.style.display = 'block';
                setTimeout(() => {
                    // Scroll to confirmation
                    confirmationMessage.scrollIntoView({ behavior: 'smooth' });
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
