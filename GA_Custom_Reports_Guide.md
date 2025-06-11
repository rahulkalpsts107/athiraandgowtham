# Google Analytics Custom Reports for Wedding Site ENV_TYPE Tracking

## Quick Setup Steps

### 1. Set Up Custom Dimension (IMPORTANT - Do This First!)
1. Go to **Google Analytics Admin** → **Data display** → **Custom definitions** → **Custom dimensions**
2. Click **Create custom dimension**
3. Fill in:
   - **Dimension name**: `ENV_TYPE`
   - **Scope**: `Event`
   - **Parameter name**: `env_type`
   - **Description**: `Tracks which wedding site version (0=Default, 1=Athira, 2=Gowtham, 3=Invite)`
4. Click **Save**

⚠️ **IMPORTANT**: Make sure the **Parameter name** is exactly `env_type` (with underscore, not `cd1`)

### 2. Create Main Performance Dashboard

#### Step A: Go to Explore
1. In GA, go to **Explore** → **Create a new exploration**
2. Choose **Free form** exploration

#### Step B: Set Up Dimensions
Add these dimensions:
- **Event name** (drag to Rows)
- **ENV_TYPE** (your custom dimension - drag to Columns)
- **Event parameter: event_label** (drag to Rows below Event name)

#### Step C: Set Up Metrics
Add these metrics:
- **Event count**
- **Total users**
- **Sessions**

#### Step D: Apply Filters (Optional)
- Filter by specific event names if you want to focus on certain actions

### 3. Pre-Made Report Templates

## Template 1: RSVP Comparison by ENV_TYPE
```
Rows: Event name (filter: Form_Submission)
Columns: ENV_TYPE 
Metrics: Event count, Total users
Filter: Event name contains "RSVP"
```

## Template 2: Photo Upload Activity
```
Rows: Event name (filter: Photo_Upload)
Columns: ENV_TYPE
Metrics: Event count
Secondary dimension: Date
```

## Template 3: Site Engagement Overview
```
Rows: Event name
Columns: ENV_TYPE
Metrics: Event count, Sessions, Engagement rate
```

## Template 4: Daily Activity Heatmap
```
Rows: Date
Columns: ENV_TYPE
Metrics: Event count
Filters: Last 30 days
```

### 4. What Each ENV_TYPE Means

| ENV_TYPE | Site Version | URL |
|----------|--------------|-----|
| 0 | Default Site | athiraandgowtham.onrender.com |
| 1 | Athira Weds Gowtham | athirawedsgowthan.onrender.com |
| 2 | Gowtham Weds Athira | gowthamwedsathira.onrender.com |
| 3 | Wedding Invite | athiraandgowtham-wedding-invite.onrender.com |

### 5. Key Events to Track

| Event Category | Event Action | What It Tracks |
|----------------|--------------|----------------|
| Site_Visit | Homepage_Load | People viewing your invitation |
| Form_Submission | RSVP_Submit | Wedding RSVPs |
| Form_Submission | Contact_Form_Submit | Contact messages |
| Form_Submission | Guestbook_Submit | Guestbook entries |
| Photo_Upload | Shared_Photo_Upload | Guest photo uploads |
| Content_Load | Shared_Photos_Load | Viewing shared photos |
| Content_Load | Our_Photos_Load | Viewing your photos |
| File_Download | Calendar_Download | Calendar file downloads |

### 6. Quick Analysis Questions You Can Answer

1. **Which site version gets more RSVPs?**
   - Filter by Form_Submission → RSVP_Submit
   - Compare ENV_TYPE columns

2. **Which version is more engaging?**
   - Look at total events per ENV_TYPE
   - Check photo uploads and guestbook entries

3. **What's the conversion funnel?**
   - Homepage_Load → RSVP_Submit ratio per ENV_TYPE

4. **When do people visit most?**
   - Use date dimension with ENV_TYPE

### 7. Setting Up Alerts

1. Go to **Admin** → **Data and privacy** → **Data retention**
2. Set up custom alerts for:
   - New RSVP submissions
   - High traffic days
   - Photo upload spikes

### 8. Exporting Data

To export your ENV_TYPE comparison:
1. Create your custom report
2. Click **Share** → **Download file**
3. Choose format (PDF, CSV, Google Sheets)

### 9. Mobile Analytics Dashboard

For quick mobile checking:
1. Download Google Analytics app
2. Add custom cards for:
   - Total events by ENV_TYPE
   - RSVP count comparison
   - Real-time activity

### 10. Advanced Segmentation

Create audience segments:
1. **High Engagement Visitors**: Multiple events per session
2. **RSVP Converters**: Visited + submitted RSVP
3. **Photo Contributors**: Uploaded photos or viewed galleries

## Troubleshooting

**If you don't see ENV_TYPE data:**
1. Check if GOOGLE_ANALYTICS_ID is set in your environment
2. Wait 24-48 hours for data to populate
3. Test by visiting your site and checking Realtime reports

**If events aren't showing:**
1. Verify the universal-analytics package is installed
2. Check server logs for GA tracking errors
3. Ensure your GA property is set to GA4 (not Universal Analytics)

## Sample Questions for Analysis

- Which ENV_TYPE has the highest RSVP conversion rate?
- What time of day do people interact with each site version?
- Which version generates more photo uploads?
- How does guestbook engagement compare across versions?
- Which site version has the longest session duration?