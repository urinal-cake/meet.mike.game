// Initialize date picker with minimum date of tomorrow
// API Base URL - update this to point to your deployed scheduler-api worker
const API_BASE_URL = 'https://scheduler-api.urinal-cake.workers.dev';

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
            id: 'gdc-pleasant-talk',
            title: 'GDC: A Pleasant Talk',
            description: 'Have something you want to talk to me about specifically? A little more time will be good for us to run through it all.',
            durationMinutes: 40,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '08:30',
            dailyEnd: '17:30',
            blocked: [{ start: '11:45', end: '13:15' }],
        },
        {
            id: 'gdc-quick-chat',
            title: 'GDC: A Quick Chat',
            description: "Let's meet quickly, catch up, and discuss what's happening!",
            durationMinutes: 20,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '08:30',
            dailyEnd: '17:30',
            blocked: [{ start: '11:45', end: '13:15' }],
        },
        {
            id: 'gdc-lunch',
            title: 'GDC: Lunch',
            description: 'Meet in person for lunch during GDC.',
            durationMinutes: 60,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '12:00',
            dailyEnd: '13:00',
            blocked: [],
        },
        {
            id: 'gdc-dinner',
            title: 'GDC: Dinner',
            description: 'Meet in person for dinner during GDC.',
            durationMinutes: 90,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '18:00',
            dailyEnd: '18:30',
            blocked: [],
        },
    ];

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

    // Enable/disable book button based on form completion
    [nameInput, emailInput, companyInput, roleInput, dateInput].forEach(input => {
        input.addEventListener('input', updateBookButtonState);
    });

    // Keep step 4 hidden until a valid location is selected
    step4Section.style.display = 'none';

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
        return `${start.toLocaleDateString(undefined, options)} – ${end.toLocaleDateString(undefined, options)}`;
    }

    renderMeetingTypes();
    function renderMeetingTypes() {
        meetingTypesContainer.innerHTML = '';
        const use24Hour = use24HourMeetingTypeCheckbox.checked;

        meetingTypes.forEach((type) => {
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
                    <span><i class="fas fa-clock"></i> ${dailyStart} – ${dailyEnd}</span>
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
        // Lock to Pacific Time for GDC events in San Francisco
        timezoneSelect.value = 'America/Los_Angeles';
    }

    function updateLocationSectionForMeetingType(type) {
        console.log('🎯 updateLocationSectionForMeetingType called for:', type.id);
        
        const locationMeetingSection = document.getElementById('locationMeetingSection');
        const locationLunchSection = document.getElementById('locationLunchSection');
        const locationDinnerSection = document.getElementById('locationDinnerSection');
        const customLunchDiv = document.getElementById('customLocationLunchDiv');
        const customDinnerDiv = document.getElementById('customLocationDinnerDiv');
        const customMeetingDiv = document.getElementById('customLocationMeetingDiv');

        // Hide all location sections and custom divs
        locationMeetingSection.style.display = 'none';
        locationLunchSection.style.display = 'none';
        locationDinnerSection.style.display = 'none';
        if (customLunchDiv) customLunchDiv.style.display = 'none';
        if (customDinnerDiv) customDinnerDiv.style.display = 'none';
        if (customMeetingDiv) customMeetingDiv.style.display = 'none';

        // Clear all location selections
        document.querySelectorAll('input[name="location"]').forEach(radio => radio.checked = false);
        document.getElementById('customLocationLunch').value = '';
        document.getElementById('customLocationDinner').value = '';
        const customMeetingInput = document.getElementById('customLocationMeeting');
        if (customMeetingInput) customMeetingInput.value = '';

        // Show appropriate section based on meeting type
        if (type.id === 'gdc-lunch') {
            console.log('📍 Showing lunch location section');
            locationLunchSection.style.display = 'block';
        } else if (type.id === 'gdc-dinner') {
            console.log('📍 Showing dinner location section');
            locationDinnerSection.style.display = 'block';
        } else if (type.id === 'gdc-pleasant-talk' || type.id === 'gdc-quick-chat') {
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
        console.log('📍 Location change event:', { id: e.target.id, name: e.target.name, checked: e.target.checked });
        
        if (e.target.name === 'location' && e.target.checked) {
            console.log('✅ Valid location radio - processing...');
            
            const customLunchDiv = document.getElementById('customLocationLunchDiv');
            const customDinnerDiv = document.getElementById('customLocationDinnerDiv');
            const customMeetingDiv = document.getElementById('customLocationMeetingDiv');
            
            console.log('🔍 Found custom divs:', {
                lunch: !!customLunchDiv,
                dinner: !!customDinnerDiv,
                meeting: !!customMeetingDiv
            });
            
            // Hide all custom input divs initially
            if (customLunchDiv) customLunchDiv.style.display = 'none';
            if (customDinnerDiv) customDinnerDiv.style.display = 'none';
            if (customMeetingDiv) customMeetingDiv.style.display = 'none';
            
            // Show custom input based on selected option
            if (e.target.id === 'loc-lunch-later') {
                console.log('🍽️ Showing lunch custom div');
                if (customLunchDiv) customLunchDiv.style.display = 'block';
            } else if (e.target.id === 'loc-dinner-later') {
                console.log('🍴 Showing dinner later custom div');
                if (customDinnerDiv) customDinnerDiv.style.display = 'block';
            } else if (e.target.id === 'loc-dinner-custom') {
                console.log('✏️ Showing dinner custom div (suggest)');
                if (customDinnerDiv) {
                    console.log('Setting display to block');
                    customDinnerDiv.style.display = 'block';
                    console.log('After setting:', customDinnerDiv.style.display);
                }
            } else if (e.target.id === 'loc-meeting-custom') {
                console.log('📍 Showing meeting custom div (suggest)');
                if (customMeetingDiv) customMeetingDiv.style.display = 'block';
            } else {
                console.log('ℹ️ Location is preset, not showing custom field');
            }
            
            // Show Step 4 only if a valid (non-custom) location is selected
            const customLocationOptions = ['loc-lunch-later', 'loc-dinner-later', 'loc-dinner-custom', 'loc-meeting-custom'];
            if (!customLocationOptions.includes(e.target.id)) {
                step4Section.style.display = 'block';
                setTimeout(() => {
                    step4Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        } else {
            console.log('❌ Not a valid location change:', { name: e.target.name, checked: e.target.checked });
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

    function fetchAvailableSlots() {
        const date = dateInput.value;
        const timezone = timezoneSelect.value;


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
                    button.addEventListener('click', function() {
                        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
                        this.classList.add('selected');
                        selectedTime = this.dataset.time;
                        updateBookButtonState();
                        
                        // Show step 3 and scroll to it when time is selected
                        step3Section.style.display = 'block';
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
        
        // Get selected location
        let location = '';
        const selectedLocationRadio = document.querySelector('input[name="location"]:checked');
        if (selectedLocationRadio) {
            location = selectedLocationRadio.value;
        }

        // Get custom location if provided
        if (!location || location === '') {
            if (selectedMeetingType.id === 'gdc-lunch') {
                const customLunch = document.getElementById('customLocationLunch').value.trim();
                if (customLunch) {
                    location = customLunch;
                }
            } else if (selectedMeetingType.id === 'gdc-dinner') {
                const customDinner = document.getElementById('customLocationDinner').value.trim();
                if (customDinner) {
                    location = customDinner;
                }
            } else if (selectedMeetingType.id === 'gdc-pleasant-talk' || selectedMeetingType.id === 'gdc-quick-chat') {
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
                // Clear form
                nameInput.value = '';
                emailInput.value = '';
                companyInput.value = '';
                roleInput.value = '';
                
                confirmationMessage.style.display = 'block';
                setTimeout(() => {
                    // Scroll to confirmation
                    confirmationMessage.scrollIntoView({ behavior: 'smooth' });
                }, 100);

                // Reload available slots
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
