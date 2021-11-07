const { S3, EC2 } = require("aws-sdk");
var stringify = require("csv-stringify");
var moment = require("moment"); // require

var s3 = new S3();
var ec2 = new EC2({
  region: process.env.AWSREGION || "us-east-1"
});

const NO_DELETE_TAG = process.env.NO_DELETE_TAG || "nodelete";

exports.handler = async (event, context) => {
  console.log(JSON.stringify(event, undefined, 2));
  const result = await describeVolumes();
  return { ...result };
};

async function describeVolumes() {
  var params = {
    Filters: [
      {
        Name: "status",
        Values: ["available"]
      }
    ]
  };
  const ListVolumen = (await ec2.describeVolumes(params).promise()).Volumes;
  const data = await ListVolumen.filter((e) => {
    e.CreateTime = moment(e.CreateTime).format();
    e.Tags.forEach((tag) => {
      Object.assign(e, { ["tag:" + tag.Key]: tag.Value });
    });
    return !e.Tags.find(
      (tag) => tag.Key.toLowerCase() === NO_DELETE_TAG.toLowerCase()
    );
  });
  if (data.length === 0) {
    console.log("No existen imagenes que borrar");
    return {
      error: "No existen imagenes que borrar"
    };
  }
  for (let index = 0; index < data.length; index++) {
    const element = data[index];
    var params = {
      VolumeId: element.VolumeId
    };
    await ec2.deleteVolume(params, function (err, data) {
      if (err) {
        element.deleteState = "Error";
        console.log(err, err.stack);
      } else {
        element.deleteState = "Yes";
      }
    });
  }
  const keyObjet = `volumes-deleted/${moment().format("YYYYMMDD_HHmmss")}.csv`;
  await stringify(
    data,
    {
      header: true
    },
    function (err, output) {
      if (err) {
        console.log(err);
        return {};
      }
      var params = {
        Body: output,
        Bucket: process.env.BUCKET_NAME,
        Key: keyObjet
      };
      s3.putObject(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else console.log(data);
      });
    }
  );
  return data;
}
