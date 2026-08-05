from src.duplicate_detection import is_duplicate

new_report = {

    "id":"HZ999",

    "image":"examples/test.jpg",

    "latitude":22.5726,

    "longitude":88.3639,

    "timestamp":"2026-08-05T12:10:00",

    "class_name":"Pothole"

}

existing = [

{

"id":"HZ001",

"image":"examples/old.jpg",

"latitude":22.5728,

"longitude":88.3640,

"timestamp":"2026-08-05T12:05:00",

"class_name":"Pothole"

}

]

print(

is_duplicate(

new_report,

existing

)

)
